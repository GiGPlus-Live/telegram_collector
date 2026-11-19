import { createHash } from "node:crypto";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import TelegramAccount from "../Models/TelegramAccount.js";
import Setting from "../Models/Setting.js";
import { buildGramJsProxy } from "../Services/tgProxy.service.js";
import { getTelegramCredentials } from "../Utils/telegramCredentials.js";

export { buildGramJsProxy };

function accountSignature(accounts) {
    const credentials = accounts.map(account => [
        String(account._id),
        account.session || account.sessionString || account.tgSession || account.sessionStr,
        account.apiId || account.api_id,
        account.apiHash || account.api_hash,
    ]).sort(([left], [right]) => left.localeCompare(right));
    return createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
}

/**
 * Multi-Account Telegram Client Manager
 * - Loads active accounts from MongoDB TelegramAccount.find({ isActive: true })
 * - Gracefully falls back to .env credentials if no DB accounts exist
 * - Provides round-robin or assigned account pooling across channels
 * - Dynamically configures GramJS proxy from MongoDB Setting with Hot-Reload
 */
export class TelegramAccountManager {
    constructor() {
        this.accounts = []; // Array of { id, phone, title, client, accountDoc }
        this.rrIndex = 0;
        this.proxy = undefined;
        this.proxySignature = "";
        this.initialized = false;
    }

    _computeProxySignature(proxy) {
        if (!proxy) return "none";
        return JSON.stringify([proxy.enabled, proxy.type, proxy.host, proxy.port, proxy.username, proxy.password, proxy.secret]);
    }

    async initialize() {
        // 1. Fetch dynamic proxy settings from MongoDB
        this.accounts = [];
        let setting;
        try {
            setting = await Setting.findOne();
            this.proxySignature = this._computeProxySignature(setting?.proxy);
            this.proxy = buildGramJsProxy(setting?.proxy);
            if (this.proxy) {
                console.log(`🌐 GramJS Proxy configured from DB: ${setting.proxy.type} -> ${setting.proxy.host}:${setting.proxy.port}`);
            } else {
                console.log("🌐 GramJS Proxy: NONE (Direct connection)");
            }
        } catch (err) {
            console.warn("⚠️ Proxy config error:", err.message);
            this.proxy = undefined;
            this.initialized = true;
            return this;
        }

        // 2. Load active Telegram accounts from MongoDB
        let dbAccounts = [];
        try {
            dbAccounts = await TelegramAccount.find({ isActive: true });
        } catch (err) {
            console.warn("⚠️ Error querying TelegramAccount collection:", err.message);
        }

        this.accounts = [];

        if (dbAccounts && dbAccounts.length > 0) {
            console.log(`📱 Found ${dbAccounts.length} active Telegram account(s) in DB. Connecting...`);
            for (const acc of dbAccounts) {
                try {
                    const { apiId, apiHash } = getTelegramCredentials(acc.apiId || acc.api_id, acc.apiHash || acc.api_hash);
                    const sessionStr = acc.session || acc.sessionString || acc.tgSession || acc.sessionStr || "";
                    const phone = acc.phone || acc.phoneNumber || "";

                    const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
                        connectionRetries: 5,
                        proxy: this.proxy,
                    });

                    await client.connect();
                    const isAuth = await client.checkAuthorization();
                    if (!isAuth) {
                        console.warn(`⚠️ Telegram account ${phone || acc._id} session is not authorized`);
                        await client.disconnect();
                        continue;
                    } else {
                        console.log(`✅ Telegram account connected: ${acc.title || phone || acc._id}`);
                    }

                    this.accounts.push({
                        id: acc._id.toString(),
                        phone: phone,
                        title: acc.title || phone || acc._id.toString(),
                        client,
                        accountDoc: acc,
                    });
                } catch (accErr) {
                    console.error(`❌ Failed to connect account ${acc.phone || acc._id}:`, accErr.message);
                }
            }
        }

        // 3. Graceful fallback to .env credentials if no accounts available in DB or all failed
        if (this.accounts.length === 0) {
            const hasEnvCredentials = Boolean(
                process.env.API_ID &&
                process.env.API_HASH &&
                (process.env.PHONE || process.env.TG_SESSION)
            );

            if (hasEnvCredentials) {
                console.log("ℹ️ No active Telegram accounts in DB. Falling back to .env credentials...");
                try {
                    const envClient = await this._createEnvClient();
                    if (envClient) {
                        this.accounts.push(envClient);
                    }
                } catch (envErr) {
                    console.warn("⚠️ Could not connect fallback .env account:", envErr.message);
                }
            } else {
                console.log("ℹ️ No Telegram accounts in DB or .env. You can connect Telegram accounts dynamically via the Web UI.");
            }
        }

        this.initialized = true;
        console.log(`🚀 TelegramAccountManager initialized with ${this.accounts.length} active client(s)`);
        return this;
    }

    /**
     * Hot-reloads proxy configuration and active accounts from DB without requiring collector restart
     */
    async syncWithDb(setting) {
        if (!this.initialized) return;

        try {
            const currentSetting = setting || (await Setting.findOne());
            const newSig = this._computeProxySignature(currentSetting?.proxy);

            let dbAccounts = [];
            try {
                dbAccounts = await TelegramAccount.find({ isActive: true });
            } catch (err) {
                return;
            }

            const currentAccounts = this.accounts.filter(account => account.accountDoc).map(account => account.accountDoc);
            if (newSig !== this.proxySignature || accountSignature(currentAccounts) !== accountSignature(dbAccounts)) {
                console.log("🔄 Detected changes in Proxy settings or active accounts. Re-syncing Telegram clients...");
                await this.disconnectAll();
                await this.initialize();
            }
        } catch (err) {
            console.warn("⚠️ Error during TelegramAccountManager hot-sync:", err.message);
        }
    }

    async _createEnvClient() {
        const apiId = Number(process.env.API_ID);
        const apiHash = process.env.API_HASH;
        const phone = process.env.PHONE;
        const sessionStr = process.env.TG_SESSION || "";

        if (!apiId || !apiHash) {
            throw new Error("API_ID and API_HASH must be set in .env when no DB accounts exist");
        }

        const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
            connectionRetries: 5,
            proxy: this.proxy,
        });

        await client.connect();
        const isAuth = await client.checkAuthorization();

        if (!isAuth && phone) {
            console.log(`🔐 Authorization required for .env account ${phone}...`);
            await client.start({
                phoneNumber: async () => phone,
                phoneCode: async () => await input.text("Telegram code: "),
                password: async () => await input.text("2FA password (if enabled): "),
                onError: (err) => console.log(err),
            });
        }

        console.log(`✅ Telegram client connected from .env (${phone || "default"})`);

        return {
            id: "env",
            phone: phone || "env",
            title: "Default (.env)",
            client,
            accountDoc: null,
        };
    }

    getClientForChannel(channelDoc) {
        if (!this.accounts.length) {
            throw new Error("هیچ اکانت تلگرامی در سامانه فعال نیست. لطفاً از پنل وب یک اکانت متصل فرمایید.");
        }

        // If specific account assigned to channel
        if (channelDoc?.telegramAccountId) {
            const assignedId = channelDoc.telegramAccountId._id
                ? channelDoc.telegramAccountId._id.toString()
                : channelDoc.telegramAccountId.toString();
            const found = this.accounts.find(a => a.id === assignedId);
            if (found) {
                return found.client;
            }
            console.warn(`⚠️ Assigned account ${assignedId} not active in pool for @${channelDoc.username}. Falling back to round-robin.`);
        }

        // Round-robin
        const selected = this.accounts[this.rrIndex % this.accounts.length];
        this.rrIndex = (this.rrIndex + 1) % this.accounts.length;
        return selected.client;
    }

    getDefaultClient() {
        if (!this.accounts.length) {
            throw new Error("هیچ اکانت تلگرامی در سامانه فعال نیست.");
        }
        return this.accounts[0].client;
    }

    getAllClients() {
        return this.accounts.map(a => a.client);
    }

    async disconnectAll() {
        for (const acc of this.accounts) {
            try {
                await acc.client.disconnect();
            } catch (err) {}
        }
        this.accounts = [];
        this.initialized = false;
    }
}

let instance = null;

export function getAccountManager() {
    if (!instance) {
        instance = new TelegramAccountManager();
    }
    return instance;
}

export default getAccountManager;
