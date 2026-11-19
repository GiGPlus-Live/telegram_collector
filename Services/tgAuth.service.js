import crypto from "crypto";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import Setting from "../Models/Setting.js";
import TelegramAccount from "../Models/TelegramAccount.js";
import { buildGramJsProxy, getEffectiveProxyFromDb } from "./tgProxy.service.js";
import { validateTelegramCredentials } from "../Utils/telegramCredentials.js";

export const pendingSessions = new Map();

export { buildGramJsProxy };

/**
 * Cleans up pending sessions older than 10 minutes
 */
export function cleanupExpiredSessions() {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [token, session] of pendingSessions.entries()) {
        if (now - session.createdAt > tenMinutes) {
            try {
                if (session.client) session.client.disconnect();
            } catch (e) {}
            pendingSessions.delete(token);
        }
    }
}

// Background cleanup every 5 minutes
const cleanupTimer = setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Initiates Telegram login by sending verification code
 * All Telegram traffic strictly routes through the panel proxy
 */
export async function sendCode({ phone, apiId, apiHash }) {
    cleanupExpiredSessions();

    if (typeof phone !== "string" || !phone.trim()) {
        throw new Error("شماره تلفن الزامی است.");
    }

    const { apiId: effectiveApiId, apiHash: effectiveApiHash } = validateTelegramCredentials(apiId, apiHash);

    // Fetch DB settings to apply proxy (Fail-closed: all Telegram traffic must go through proxy if configured)
    const { proxyOptions, isEnabled, rawProxy } = await getEffectiveProxyFromDb({ failClosed: true });

    if (isEnabled && proxyOptions) {
        console.log(`🌐 [Telegram Login] Routing auth traffic via ${rawProxy?.type?.toUpperCase()} proxy: ${rawProxy?.host}:${rawProxy?.port}`);
    } else {
        console.log("🌐 [Telegram Login] Direct connection (no proxy active in settings)");
    }

    const client = new TelegramClient(new StringSession(""), effectiveApiId, effectiveApiHash, {
        connectionRetries: 3,
        proxy: proxyOptions,
    });

    // Helper signIn on client instance
    client.signIn = async function ({ phoneNumber, phoneCodeHash, phoneCode }) {
        return await client.invoke(
            new Api.auth.SignIn({
                phoneNumber,
                phoneCodeHash,
                phoneCode: String(phoneCode).trim(),
            })
        );
    };

    // Helper signInWithPassword supporting both single arg { password } and standard params
    const originalSignInWithPassword = client.signInWithPassword.bind(client);
    client.signInWithPassword = async function (arg1, arg2) {
        if (arg2) {
            return await originalSignInWithPassword(arg1, arg2);
        }
        const pwd = typeof arg1 === "object" ? (arg1.password || "") : String(arg1);
        const apiCreds = { apiId: effectiveApiId, apiHash: effectiveApiHash };
        return await originalSignInWithPassword(apiCreds, {
            password: async () => pwd,
            onError: (err) => {
                throw err;
            },
        });
    };

    try {
        await client.connect();
    } catch (connErr) {
        if (isEnabled) {
            throw new Error(`خطا در اتصال به تلگرام از طریق پروکسی (${rawProxy?.host}:${rawProxy?.port}): ${connErr.message}. لطفاً وضعیت اتصال و سلامت پروکسی را در تب «تنظیمات پروکسی» بررسی نمایید.`);
        } else {
            throw new Error(`خطا در اتصال مستقیم به سرورهای تلگرام: ${connErr.message}. به دلیل محدودیت‌های اینترنت و فیلترینگ، لطفاً ابتدا در تب «تنظیمات پروکسی» یک پروکسی SOCKS5 یا MTProto تنظیم و فعال فرمایید.`);
        }
    }

    let result;
    try {
        result = await client.sendCode(
            { apiId: effectiveApiId, apiHash: effectiveApiHash },
            phone.trim()
        );
    } catch (sendErr) {
        try {
            await client.disconnect();
        } catch (e) {}
        if (sendErr.errorMessage === "API_ID_INVALID") {
            throw new Error("تلگرام مشخصات برنامه را نپذیرفت. API ID و API Hash را از یک برنامه وارد کنید.");
        }
        if (sendErr.errorMessage === "API_ID_PUBLISHED_FLOOD") {
            throw new Error("تلگرام این API ID را محدود کرده است. مشخصات برنامهٔ خودتان را وارد کنید.");
        }
        throw sendErr;
    }

    const loginToken = crypto.randomUUID();

    pendingSessions.set(loginToken, {
        client,
        phone: phone.trim(),
        phoneCodeHash: result.phoneCodeHash,
        apiId: effectiveApiId,
        apiHash: effectiveApiHash,
        createdAt: Date.now(),
    });

    return {
        loginToken,
        phone: phone.trim(),
        phoneCodeHash: result.phoneCodeHash,
    };
}

/**
 * Verifies received code
 */
export async function verifyCode({ loginToken, code }) {
    cleanupExpiredSessions();

    const pending = pendingSessions.get(loginToken);
    if (!pending) {
        throw new Error("جلسه ورود منقضی شده یا نامعتبر است. لطفاً مجدداً شماره را وارد کنید.");
    }

    if (!code || !code.trim()) {
        throw new Error("کد تایید الزامی است.");
    }

    const { client } = pending;

    try {
        await client.signIn({
            phoneNumber: pending.phone,
            phoneCodeHash: pending.phoneCodeHash,
            phoneCode: code.trim(),
        });
    } catch (err) {
        const errMsg = (err.errorMessage || err.message || "").toUpperCase();
        if (
            errMsg.includes("SESSION_PASSWORD_NEEDED") ||
            errMsg.includes("PASSWORD") ||
            errMsg.includes("2FA") ||
            err.name === "SessionPasswordNeededError"
        ) {
            return { needs2FA: true, loginToken };
        }
        throw err;
    }

    const sessionString = client.session.save();
    let me = null;
    try {
        me = await client.getMe();
    } catch (e) {
        console.warn("Could not fetch Telegram getMe:", e.message);
    }

    const title = me?.firstName
        ? `${me.firstName}${me.lastName ? " " + me.lastName : ""}`
        : (me?.username ? `@${me.username}` : pending.phone);

    const account = await TelegramAccount.findOneAndUpdate(
        { phone: pending.phone },
        {
            phone: pending.phone,
            session: sessionString,
            apiId: pending.apiId,
            apiHash: pending.apiHash,
            title: title,
            isActive: true,
        },
        { upsert: true, new: true }
    );

    try {
        await client.disconnect();
    } catch (e) {}

    pendingSessions.delete(loginToken);

    return {
        success: true,
        needs2FA: false,
        user: me,
        account,
    };
}

/**
 * Verifies 2FA password
 */
export async function verify2FA({ loginToken, password }) {
    cleanupExpiredSessions();

    const pending = pendingSessions.get(loginToken);
    if (!pending) {
        throw new Error("جلسه ورود منقضی شده یا نامعتبر است. لطفاً مجدداً اقدام فرمایید.");
    }

    if (!password || !password.trim()) {
        throw new Error("رمز عبور دو مرحله‌ای الزامی است.");
    }

    const { client } = pending;

    await client.signInWithPassword({ password: password.trim() });

    const sessionString = client.session.save();
    let me = null;
    try {
        me = await client.getMe();
    } catch (e) {
        console.warn("Could not fetch Telegram getMe:", e.message);
    }

    const title = me?.firstName
        ? `${me.firstName}${me.lastName ? " " + me.lastName : ""}`
        : (me?.username ? `@${me.username}` : pending.phone);

    const account = await TelegramAccount.findOneAndUpdate(
        { phone: pending.phone },
        {
            phone: pending.phone,
            session: sessionString,
            apiId: pending.apiId,
            apiHash: pending.apiHash,
            title: title,
            isActive: true,
        },
        { upsert: true, new: true }
    );

    try {
        await client.disconnect();
    } catch (e) {}

    pendingSessions.delete(loginToken);

    return {
        success: true,
        user: me,
        account,
    };
}

export default {
    sendCode,
    verifyCode,
    verify2FA,
    pendingSessions,
    cleanupExpiredSessions,
    buildGramJsProxy,
};
