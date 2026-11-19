import { createHash, randomUUID } from "node:crypto";
import { createClient } from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/index.js";
import { SECRET_STORAGE_ALGORITHM_V1_AES, ServerSideSecretStorageImpl } from "matrix-js-sdk/lib/secret-storage.js";
import { HandleERROR } from "../Utils/httpErrors.js";

const signingKeys = {
    master_key: "m.cross_signing.master",
    self_signing_key: "m.cross_signing.self_signing",
    user_signing_key: "m.cross_signing.user_signing",
};

const existingStorage = "حساب از قبل کلید بازیابی یا دادهٔ رمزنگاری‌شده دارد. از همان کلید یا یک نشست تأییدشده در Element استفاده کنید.";
const existingIdentity = "این حساب هویت رمزنگاری دارد و کلیدهای امضای آن روی Collector موجود نیستند. در نشست تأییدشدهٔ Element کلید بازیابی را تنظیم کنید.";
const resetEvent = "io.gigplus.telegram_collector.recovery_reset";
const activeResets = new Set();

export class MatrixRecoveryKey {
    constructor(client) {
        this.client = client;
        this.crypto = client.getCrypto();
        this.userId = client.getUserId();
        this.deviceId = client.getDeviceId();
    }

    async getSetupState(retryKeyId = null) {
        const client = this.client;
        const [defaultKeyId, backup, ...secrets] = await Promise.all([
            client.secretStorage.getDefaultKeyId(),
            client.getAccountDataFromServer("m.megolm_backup.v1"),
            ...Object.values(signingKeys).map(name => client.getAccountDataFromServer(name)),
        ]);
        if ((defaultKeyId && defaultKeyId !== retryKeyId) || Object.keys(backup?.encrypted || {}).length ||
            secrets.some(secret => Object.keys(secret?.encrypted || {}).some(id => id !== retryKeyId))) {
            throw new HandleERROR(existingStorage, 409);
        }

        const [masterKey, selfSigningKey, userSigningKey] = await this.publishedSigningKeys();
        const identityExists = Boolean(masterKey || selfSigningKey || userSigningKey);
        if (identityExists) {
            const status = await this.crypto.getCrossSigningStatus();
            if (!Object.values(status.privateKeysCachedLocally).every(Boolean)) {
                throw new HandleERROR(existingIdentity, 409);
            }
        }
        return { identityExists, defaultKeyId };
    }

    async publishedSigningKeys() {
        const keys = await this.client.http.authedRequest("POST", "/keys/query", undefined, {
            device_keys: { [this.userId]: [] },
        });
        if (Object.keys(keys.failures || {}).length) {
            throw new HandleERROR("وضعیت هویت این حساب از سرور Matrix دریافت نشد. دوباره تلاش کنید.", 424);
        }
        return ["master_keys", "self_signing_keys", "user_signing_keys"].map(name => keys[name]?.[this.userId]);
    }

    async prepare(reset = false) {
        if (!reset) await this.getSetupState();
        const key = await this.crypto.createRecoveryKeyFromPassphrase();
        key.privateKey.fill(0);
        return key.encodedPrivateKey;
    }

    unpack(value) {
        if (typeof value !== "string" || !value.trim() || value.length > 256) {
            throw new HandleERROR("کلید بازیابی Matrix را وارد کنید.", 400);
        }
        try {
            return decodeRecoveryKey(value.replace(/\s/g, ""));
        } catch {
            throw new HandleERROR("قالب کلید بازیابی Matrix معتبر نیست. Recovery Key کامل را وارد کنید.", 400);
        }
    }

    storageFor(keyId, privateKey) {
        return new ServerSideSecretStorageImpl(this.client, {
            getSecretStorageKey: async ({ keys }) => keys[keyId] ? [keyId, privateKey] : null,
        });
    }

    keyIdFor(privateKey) {
        return "collector-" + createHash("sha256").update(this.userId).update(privateKey).digest("hex");
    }

    async storeRecoveryKey(keyId, privateKey, storeBackup = false) {
        const bundle = await this.crypto.exportSecretsBundle();
        if (storeBackup && (!bundle.backup?.key || bundle.backup.backup_version !== (await this.currentBackup())?.version)) {
            throw new HandleERROR("کلید بکاپ جدید هنوز آماده نشده است. با همین کلید بازیابی دوباره تلاش کنید.", 424);
        }
        const storage = this.storageFor(keyId, privateKey);
        await storage.addKey(SECRET_STORAGE_ALGORITHM_V1_AES, { key: privateKey, name: "Collector Recovery Key" }, keyId);
        for (const [field, name] of Object.entries(signingKeys)) {
            await storage.store(name, bundle.cross_signing[field], [keyId]);
        }
        if (storeBackup) {
            await storage.store("m.megolm_backup.v1", bundle.backup.key, [keyId]);
        }
        await storage.setDefaultKeyId(keyId);
        await this.crypto.crossSignDevice(this.deviceId);
    }

    async currentBackup() {
        try {
            return await this.client.http.authedRequest("GET", "/room_keys/version");
        } catch (error) {
            if (error.httpStatus === 404) return null;
            throw error;
        }
    }

    async recover(value) {
        const privateKey = this.unpack(value);
        try {
            const storedKey = await this.client.secretStorage.getKey();
            if (!storedKey) {
                throw new HandleERROR("برای این حساب کلید بازیابی پیدا نشد. اگر حساب تازه است، گزینهٔ ساخت کلید را بزنید.", 409);
            }
            const [keyId, info] = storedKey;
            if (info.algorithm !== SECRET_STORAGE_ALGORITHM_V1_AES || !await this.client.secretStorage.checkKey(privateKey, info)) {
                throw new HandleERROR("کلید بازیابی با کلید فعال این حساب Matrix مطابقت ندارد.", 400);
            }
            const storage = this.storageFor(keyId, privateKey);
            const crossSigning = Object.fromEntries(await Promise.all(Object.entries(signingKeys).map(async ([field, name]) =>
                [field, await storage.get(name)]
            )));
            if (!Object.values(crossSigning).every(Boolean)) {
                throw new HandleERROR("کلیدهای امضای حساب در فضای بازیابی کامل نیستند. از نشست تأییدشدهٔ Element استفاده کنید.", 409);
            }
            await this.crypto.importSecretsBundle({ cross_signing: crossSigning });
            await this.crypto.crossSignDevice(this.deviceId);
        } finally {
            privateKey.fill(0);
        }
    }

    async setup(value) {
        const privateKey = this.unpack(value);
        try {
            const keyId = this.keyIdFor(privateKey);
            const { identityExists, defaultKeyId } = await this.getSetupState(keyId);
            if (!identityExists) {
                // Matrix rejects replacing an existing identity unless the user authenticates again.
                // This setup intentionally never supplies authorization for such a replacement.
                await this.crypto.bootstrapCrossSigning({
                    setupNewCrossSigning: true,
                    authUploadDeviceSigningKeys: makeRequest => makeRequest(),
                });
                if (!(await this.publishedSigningKeys()).every(Boolean)) {
                    throw new HandleERROR("ساخت هویت رمزنگاری روی Matrix کامل نشد. ثبت کلید را دوباره امتحان کنید.", 424);
                }
            }
            if (defaultKeyId === keyId) {
                await this.recover(value);
                return;
            }
            await this.storeRecoveryKey(keyId, privateKey);
        } finally {
            privateKey.fill(0);
        }
    }

    async checkPassword(password) {
        const deviceId = "collector-check-" + randomUUID();
        let session;
        try {
            session = await this.client.http.request("POST", "/login", undefined, {
                type: "m.login.password",
                identifier: { type: "m.id.user", user: this.userId },
                password,
                device_id: deviceId,
                initial_device_display_name: "Collector password check",
            });
        } catch (error) {
            if (error.httpStatus === 429) {
                throw new HandleERROR("Matrix درخواست‌های ورود را محدود کرده است. کمی بعد دوباره تلاش کنید.", 429);
            }
            throw new HandleERROR("Matrix رمز حساب بات را تأیید نکرد. قبل از بازنشانی، رمز و روش ورود حساب را بررسی کنید.", 400);
        }
        if (session.device_id !== deviceId || session.user_id !== this.userId ||
            !session.access_token || session.access_token === this.client.getAccessToken()) {
            throw new HandleERROR("Matrix نتوانست رمز را برای دستگاه درست تأیید کند.", 424);
        }
        const temporary = createClient({ baseUrl: this.client.getHomeserverUrl(), accessToken: session.access_token });
        await temporary.logout(false);
    }

    async reset(value, password) {
        const privateKey = this.unpack(value);
        const account = JSON.stringify([this.client.getHomeserverUrl(), this.userId]);
        if (activeResets.has(account)) {
            privateKey.fill(0);
            throw new HandleERROR("بازنشانی برای این حساب در حال انجام است.", 409);
        }
        activeResets.add(account);
        try {
            const keyId = this.keyIdFor(privateKey);
            if (await this.client.secretStorage.getDefaultKeyId() === keyId) {
                await this.recover(value);
                return;
            }

            const [masterKey] = await this.publishedSigningKeys();
            const masterId = Object.values(masterKey?.keys || {})[0] || null;
            const previous = await this.client.getAccountDataFromServer(resetEvent);
            const resume = previous?.keyId === keyId && previous.deviceId === this.deviceId && previous.masterId !== masterId;
            if (resume && (!masterId || await this.crypto.getCrossSigningKeyId() !== masterId)) {
                throw new HandleERROR("هویت حساب در Matrix تغییر کرده است. پیش از تکرار بازنشانی، وضعیت حساب را در Element بررسی کنید.", 409);
            }
            await this.checkPassword(password);

            if (!resume) {
                await this.client.setAccountData(resetEvent, { keyId, deviceId: this.deviceId, masterId });
                await this.crypto.resetEncryption(async makeRequest => {
                    try {
                        await makeRequest();
                    } catch (error) {
                        if (error.httpStatus !== 401 || !error.data?.session) throw error;
                        await makeRequest({
                            type: "m.login.password",
                            identifier: { type: "m.id.user", user: this.userId },
                            password,
                            session: error.data.session,
                        });
                    }
                });
            } else if (!await this.currentBackup()) {
                await this.crypto.resetKeyBackup();
            }

            await this.storeRecoveryKey(keyId, privateKey, true);
            await this.client.setAccountData(resetEvent, {}).catch(() => {});
        } finally {
            privateKey.fill(0);
            activeResets.delete(account);
        }
    }
}
