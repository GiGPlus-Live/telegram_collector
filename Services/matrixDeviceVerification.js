import { randomUUID } from "node:crypto";
import { VerificationPhase, VerificationRequestEvent, VerifierEvent } from "matrix-js-sdk/lib/crypto-api/index.js";
import { VerificationMethod } from "matrix-js-sdk/lib/types.js";
import { HandleERROR } from "../Utils/httpErrors.js";
import { MatrixRecoveryKey } from "./matrixRecoveryKey.js";

const pendingStates = new Set(["waiting", "compare", "confirming", "checking"]);
const requestLifetime = 10 * 60 * 1000;
const signatureWait = 30 * 1000;

export class MatrixDeviceVerification {
    constructor(client) {
        this.userId = client.getUserId();
        this.deviceId = client.getDeviceId();
        this.crypto = client.getCrypto();
        this.recovery = new MatrixRecoveryKey(client);
    }

    async status() {
        const info = await this.crypto.getDeviceVerificationStatus(this.userId, this.deviceId);
        const attempt = this.attempt;
        if (info?.signedByOwner) {
            this.recoverySignatureDeadline = null;
            if (this.isPending(attempt)) this.finish(attempt, "verified");
            return { userId: this.userId, deviceId: this.deviceId, state: "verified" };
        }
        if (this.recovering || this.recoverySignatureDeadline) {
            return {
                userId: this.userId,
                deviceId: this.deviceId,
                state: this.recovering || Date.now() < this.recoverySignatureDeadline ? "checking" : "failed",
            };
        }
        return {
            userId: this.userId,
            deviceId: this.deviceId,
            state: attempt?.state === "verified" ? "idle" : (attempt?.state ?? "idle"),
            attemptId: attempt?.id,
            message: attempt?.message,
            sas: attempt?.state === "compare" ? attempt.sas.sas : undefined,
        };
    }

    async start() {
        if (this.recovering || Date.now() < this.recoverySignatureDeadline) {
            throw new HandleERROR("تأیید با کلید بازیابی در حال انجام است.", 409);
        }
        this.recoverySignatureDeadline = null;
        this.starting ??= this.startAttempt().finally(() => { this.starting = null; });
        await this.starting;
        return this.status();
    }

    async prepareRecovery(reset = false) {
        this.requireRecoveryAvailable();
        return this.recovery.prepare(reset);
    }

    async verifyWithRecovery(value, create = false) {
        return this.runRecovery(
            () => create ? this.recovery.setup(value) : this.recovery.recover(value),
            "تأیید با کلید بازیابی کامل نشد. کلید همین حساب را بررسی کنید یا از نشست تأییدشدهٔ Element استفاده کنید.",
        );
    }

    async resetRecovery({ recoveryKey, password, deviceId, confirm }) {
        if (confirm !== "reset-matrix-encryption" || deviceId !== this.deviceId) {
            throw new HandleERROR("بازنشانی دستگاه فعلی و حذف بکاپ قدیمی را صریحاً تأیید کنید.", 400);
        }
        if (typeof password !== "string" || !password || password.length > 1024) {
            throw new HandleERROR("رمز عبور حساب Matrix بات را وارد کنید.", 400);
        }
        return this.runRecovery(
            () => this.recovery.reset(recoveryKey, password),
            "بازنشانی کامل نشد. برای ادامه، با همین کلید جدید و رمز حساب دوباره تلاش کنید.",
        );
    }

    async runRecovery(action, failureMessage) {
        this.requireRecoveryAvailable();
        this.recovering = true;
        this.recoverySignatureDeadline = null;
        try {
            await action();
            this.recoverySignatureDeadline = Date.now() + signatureWait;
        } catch (error) {
            if (error instanceof HandleERROR) throw error;
            throw new HandleERROR(failureMessage, 424);
        } finally {
            this.recovering = false;
        }
        return this.status();
    }

    requireRecoveryAvailable() {
        if (this.stopped || this.starting || this.recovering || this.isPending(this.attempt) || Date.now() < this.recoverySignatureDeadline) {
            throw new HandleERROR("یک درخواست تأیید در حال انجام است. آن را کامل یا لغو کنید و دوباره تلاش کنید.", 409);
        }
    }

    async startAttempt() {
        if (this.stopped) throw new HandleERROR("دستگاه Collector تغییر کرده است. دوباره وضعیت را بررسی کنید.", 409);
        if (this.isPending(this.attempt) || (await this.status()).state === "verified") return;
        let request;
        try {
            request = await this.crypto.requestOwnUserVerification();
        } catch (error) {
            if (error.message?.includes("no existing cross-signing key")) {
                throw new HandleERROR("ابتدا در Element با همین حساب وارد شوید و یک نشست تأییدشده آماده کنید.", 409);
            }
            throw new HandleERROR("درخواست تأیید به Matrix ارسال نشد. اتصال را بررسی کنید و دوباره تلاش کنید.", 424);
        }

        if (this.stopped) {
            this.cancelRequest(request);
            throw new HandleERROR("دستگاه Collector تغییر کرده است. دوباره وضعیت را بررسی کنید.", 409);
        }

        const attempt = { id: randomUUID(), state: "waiting", request };
        this.attempt = attempt;
        attempt.onChange = () => {
            this.advance(attempt).catch(() => this.fail(attempt));
        };
        request.on(VerificationRequestEvent.Change, attempt.onChange);
        this.setDeadline(attempt, Math.min(request.timeout ?? requestLifetime, requestLifetime), () => {
            this.finish(attempt, "expired");
            this.cancelRequest(request);
        });
        attempt.onChange();
    }

    async advance(attempt) {
        if (!this.isPending(attempt)) return;
        const { request } = attempt;
        if (request.phase === VerificationPhase.Cancelled) {
            this.finish(attempt, request.cancellationCode === "m.timeout" ? "expired" : "cancelled");
            return;
        }
        if (request.phase === VerificationPhase.Done) {
            this.awaitSignature(attempt);
            return;
        }
        if (attempt.negotiating || (request.phase !== VerificationPhase.Ready && request.phase !== VerificationPhase.Started)) return;

        attempt.negotiating = true;
        const verifier = request.phase === VerificationPhase.Ready
            ? await request.startVerification(VerificationMethod.Sas)
            : request.verifier;
        if (!this.isPending(attempt)) return;
        if (!verifier) throw new Error("Matrix SAS verifier unavailable");
        attempt.verifier = verifier;
        attempt.onSas = sas => {
            if (this.isPending(attempt) && attempt.state === "waiting") {
                attempt.sas = sas;
                attempt.state = "compare";
            }
        };
        verifier.on(VerifierEvent.ShowSas, attempt.onSas);
        const sas = verifier.getShowSasCallbacks();
        if (sas) attempt.onSas(sas);
        verifier.verify().then(() => this.awaitSignature(attempt), () => this.fail(attempt));
    }

    async confirm(attemptId) {
        const attempt = this.requireAttempt(attemptId);
        if (attempt.state !== "compare") {
            throw new HandleERROR("هنوز ایموجی‌ها برای مقایسه آماده نیستند یا قبلاً تأیید شده‌اند.", 409);
        }
        attempt.state = "confirming";
        try {
            await attempt.sas.confirm();
        } catch {
            this.fail(attempt);
        }
        return this.status();
    }

    async cancel(attemptId) {
        const attempt = this.requireAttempt(attemptId);
        const { request } = attempt;
        this.finish(attempt, "cancelled");
        this.cancelRequest(request);
        return this.status();
    }

    requireAttempt(id) {
        const attempt = this.attempt;
        if (!this.isPending(attempt) || attempt.id !== id) {
            throw new HandleERROR("این درخواست تأیید پایان یافته است. وضعیت را دوباره بررسی کنید.", 409);
        }
        return attempt;
    }

    awaitSignature(attempt) {
        if (!this.isPending(attempt) || attempt.state === "checking") return;
        attempt.state = "checking";
        this.setDeadline(attempt, signatureWait, () => {
            this.finish(attempt, "failed", "امضای دستگاه هنوز دریافت نشده است. وضعیت را دوباره بررسی کنید یا از یک نشست تأییدشده در Element استفاده کنید.");
        });
    }

    fail(attempt) {
        if (!this.isPending(attempt)) return;
        const { request } = attempt;
        if (request.phase === VerificationPhase.Cancelled) {
            this.finish(attempt, request.cancellationCode === "m.timeout" ? "expired" : "cancelled");
            return;
        }
        this.finish(attempt, "failed", "تأیید Matrix کامل نشد. از نشست تأییدشدهٔ همان حساب دوباره تلاش کنید.");
        this.cancelRequest(request);
    }

    isPending(attempt) {
        return attempt && attempt === this.attempt && pendingStates.has(attempt.state);
    }

    setDeadline(attempt, delay, expire) {
        clearTimeout(attempt.timer);
        attempt.timer = setTimeout(expire, delay);
        attempt.timer.unref();
    }

    finish(attempt, state, message) {
        clearTimeout(attempt.timer);
        attempt.request.off(VerificationRequestEvent.Change, attempt.onChange);
        attempt.verifier?.off(VerifierEvent.ShowSas, attempt.onSas);
        this.attempt = { id: attempt.id, state, message };
    }

    cancelRequest(request) {
        if (request.pending) request.cancel().catch(() => {});
    }

    stop() {
        this.stopped = true;
        if (!this.isPending(this.attempt)) return;
        const attempt = this.attempt;
        this.finish(attempt, "cancelled");
        this.cancelRequest(attempt.request);
    }
}
