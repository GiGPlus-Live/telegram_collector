import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import TelegramAccount from "../Models/TelegramAccount.js";
import { getTelegramCredentials } from "../Utils/telegramCredentials.js";
import { buildGramJsProxy } from "./tgProxy.service.js";

export function getProxyTestAccount() {
    return TelegramAccount.findOne({ isActive: true, session: { $exists: true, $nin: ["", null] } })
        .select("apiId apiHash");
}

export async function testProxy(config) {
    const account = await getProxyTestAccount();
    if (!account) throw new Error("برای تست پروکسی ابتدا یک اکانت فعال تلگرام ثبت کنید.");
    const proxy = buildGramJsProxy({ ...config, type: config.type || "socks5", enabled: true });
    const { apiId, apiHash } = getTelegramCredentials(account.apiId, account.apiHash);
    const client = new TelegramClient(
        new StringSession(""),
        apiId,
        apiHash,
        { proxy, connectionRetries: 1, requestRetries: 1, autoReconnect: false }
    );

    const startTime = Date.now();
    let timer;
    try {
        // GramJS connect waits for Telegram's help.getConfig response on a fresh session.
        const connected = await Promise.race([
            client.connect(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("سرور تلگرام در مهلت تست از طریق پروکسی پاسخ نداد.")), 15000);
            }),
        ]);
        if (!connected) throw new Error("اتصال به سرور تلگرام از طریق پروکسی کامل نشد.");
        return { success: true, latencyMs: Date.now() - startTime };
    } finally {
        clearTimeout(timer);
        await client.destroy().catch(() => {});
    }
}

export default testProxy;
