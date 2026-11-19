import Setting from "../Models/Setting.js";

/**
 * Validates and builds GramJS-compatible proxy options from MongoDB Setting.proxy object.
 * 
 * Critical Fixes:
 * 1. GramJS expects `timeout` in SECONDS (PromisedNetSockets multiplies it by 1000).
 *    Passing 10_000 was causing a 2.78-hour socket hang! Changed to 10 seconds.
 * 2. Fail-Closed security: When proxy is enabled in DB/panel, we NEVER fall back
 *    to an unproxied direct connection. If config is invalid, an error is thrown.
 * 3. Sanitizes host, port, username, password, and MTProto secrets.
 */
export function buildGramJsProxy(proxy, { failClosed = true } = {}) {
    if (!proxy) {
        return undefined;
    }

    // Determine if proxy is enabled
    const isEnabled = proxy.enabled === true || (
        proxy.enabled !== false &&
        proxy.type &&
        proxy.type !== "none"
    );

    if (!isEnabled) {
        return undefined;
    }

    const type = String(proxy.type || "").toLowerCase().trim();
    const host = String(proxy.host || "").trim();
    const port = Number(proxy.port);

    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
        if (failClosed) {
            throw new Error(`تنظیمات پروکسی فعال است اما هاست (${host || "خالی"}) یا پورت (${proxy.port || "خالی"}) نامعتبر است. جهت جلوگیری از نشت ترافیک مستقیم، اتصال متوقف شد.`);
        }
        return undefined;
    }

    if (type === "socks5") {
        return {
            ip: host,
            port: port,
            socksType: 5,
            username: proxy.username ? String(proxy.username).trim() : undefined,
            password: proxy.password ? String(proxy.password) : undefined,
            timeout: 10, // 10 seconds (GramJS multiplies by 1000)
        };
    }

    if (type === "socks4") {
        return {
            ip: host,
            port: port,
            socksType: 4,
            username: proxy.username ? String(proxy.username).trim() : undefined,
            password: proxy.password ? String(proxy.password) : undefined,
            timeout: 10,
        };
    }

    if (type === "mtproto") {
        const secret = String(proxy.secret || "").trim();
        if (!secret) {
            throw new Error("پروکسی MTProto انتخاب شده است اما سکرت (Secret) وارد نشده است.");
        }
        return {
            ip: host,
            port: port,
            MTProxy: true,
            secret: secret,
            timeout: 10,
        };
    }

    if (type === "http") {
        // GramJS native socket doesn't support plain HTTP proxy without an HTTP CONNECT bridge.
        // We warn clearly instead of silently dropping the proxy to a direct connection.
        throw new Error("پروتکل HTTP برای ارتباط MTProto تلگرام مناسب نیست؛ لطفاً از پروتکل SOCKS5 یا MTProto در پنل استفاده فرمایید.");
    }

    throw new Error("نوع پروکسی تلگرام نامعتبر است.");
}

/**
 * Retrieves effective proxy configuration from database Setting document.
 */
export async function getEffectiveProxyFromDb({ failClosed = true } = {}) {
    try {
        const setting = await Setting.findOne();
        return {
            proxyOptions: buildGramJsProxy(setting?.proxy, { failClosed }),
            rawProxy: setting?.proxy || null,
            isEnabled: setting?.proxy?.enabled === true || (
                setting?.proxy?.enabled !== false &&
                setting?.proxy?.type &&
                setting?.proxy?.type !== "none"
            ),
        };
    } catch (err) {
        if (failClosed) throw err;
        console.warn("⚠️ Could not read proxy setting from DB:", err.message);
        return { proxyOptions: undefined, rawProxy: null, isEnabled: false };
    }
}

export default {
    buildGramJsProxy,
    getEffectiveProxyFromDb,
};
