import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import Setting from "../Models/Setting.js";
import { buildGramJsProxy } from "../Services/tgProxy.service.js";
import { getAccountManager } from "./accountManager.js";

export { buildGramJsProxy, getAccountManager };

export async function createTelegramClient() {
    const apiId = Number(process.env.API_ID);
    const apiHash = process.env.API_HASH;
    const phone = process.env.PHONE;

    if (!apiId || !apiHash || !phone) {
        throw new Error("API_ID, API_HASH, PHONE must be set in .env");
    }

    // Proxy from DB
    const setting = await Setting.findOne();
    const proxy = buildGramJsProxy(setting?.proxy);

    const sessionStr = process.env.TG_SESSION || "";
    const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
        connectionRetries: 5,
        proxy,
    });

    await client.start({
        phoneNumber: async () => phone,
        phoneCode: async () => await input.text("Telegram code: "),
        password: async () => await input.text("2FA password (if enabled): "),
        onError: (err) => console.log(err),
    });

    return { client, session: client.session.save() };
}

export default createTelegramClient;
