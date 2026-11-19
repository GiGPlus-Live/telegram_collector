import * as sdk from "matrix-js-sdk";
import { VerificationMethod } from "matrix-js-sdk/lib/types.js";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import https from "https";
import http from "http";
import MatrixServer from "../Models/MatrixServer.js";
import { normalizeMatrixRoomAddress } from "../Utils/matrixRoomAddress.js";
import { normalizeMatrixServerUrl } from "../Utils/matrixServerUrl.js";
import { MatrixDeviceVerification } from "./matrixDeviceVerification.js";

const projectDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let cryptoStore;
const activeCryptoStores = new Set();

function credentialKey(serverUrl, token) {
    return createHash("sha256").update(JSON.stringify([serverUrl, token])).digest("hex");
}

function initializeCryptoStore() {
    cryptoStore ??= (async () => {
        const databaseBasePath = path.resolve(process.env.MATRIX_CRYPTO_DIR || path.join(projectDir, "matrix-crypto"));
        await fs.mkdir(databaseBasePath, { recursive: true, mode: 0o700 });
        const { default: setGlobalVars } = await import("indexeddbshim");
        setGlobalVars(globalThis, { databaseBasePath, checkOrigin: false });
        globalThis.shimIndexedDB.__useShim();
    })().catch(error => {
        cryptoStore = undefined;
        throw error;
    });
    return cryptoStore;
}

function encryptAttachment(buffer) {
    const key = randomBytes(32);
    const iv = Buffer.concat([randomBytes(8), Buffer.alloc(8)]);
    const cipher = createCipheriv("aes-256-ctr", key, iv);
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return {
        data,
        file: {
            v: "v2",
            key: { kty: "oct", alg: "A256CTR", ext: true, key_ops: ["encrypt", "decrypt"], k: key.toString("base64url") },
            iv: iv.toString("base64").replace(/=+$/, ""),
            hashes: { sha256: createHash("sha256").update(data).digest("base64").replace(/=+$/, "") },
        },
    };
}

// Persistent Keep-Alive agents to stop firewalls from dropping uploads
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    timeout: 60000,
});

const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    timeout: 60000,
});

const fetchWithKeepAlive = (url, options = {}) => {
    const isHttps = url.toString().startsWith("https");
    return fetch(url, {
        ...options,
        agent: isHttps ? httpsAgent : httpAgent,
    });
};

/**
 * Single Matrix Bot Client instance connected to a specific Matrix server.
 */
export class MatrixBotClient {
    constructor(config) {
        this.config = config;
        this.serverUrl = normalizeMatrixServerUrl(config.serverUrl || config.baseUrl);
        this.userId = config.userId;
        this.token = config.token || config.accessToken;
        this.password = config.password || "";
        this.roomId = config.roomId || config.defaultRoomId || null;
        this.client = null;
        this.initialized = false;
    }

    clientOptions() {
        return {
            baseUrl: this.serverUrl,
            accessToken: this.token,
            fetchFn: fetchWithKeepAlive,
            localTimeoutMs: 30000,
        };
    }

    async identify() {
        if (!this.serverUrl || !this.token) {
            throw new Error("Missing Matrix server URL or access token");
        }
        return sdk.createClient(this.clientOptions()).whoami();
    }

    deviceKey({ user_id, device_id }) {
        if (!device_id) return undefined;
        return createHash("sha256").update(JSON.stringify([this.serverUrl, user_id, device_id])).digest("hex");
    }

    async initialize(identity) {
        if (this.initialized) return;

        try {
            identity ??= await this.identify();
            const { user_id: userId, device_id: deviceId } = identity;
            this.userId = userId;
            this.client = sdk.createClient({
                ...this.clientOptions(),
                userId,
                deviceId,
                verificationMethods: [VerificationMethod.Sas],
            });

            if (deviceId) {
                const prefix = this.deviceKey(identity);
                if (activeCryptoStores.has(prefix)) throw new Error("This Matrix device is already in use by the collector");
                activeCryptoStores.add(prefix);
                this.cryptoStorePrefix = prefix;
                await initializeCryptoStore();
                await this.client.initRustCrypto({ cryptoDatabasePrefix: prefix });
            }

            await this.startSync();
            this.initialized = true;
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    async startSync() {
        let timer;
        let onSync;
        try {
            await new Promise((resolve, reject) => {
                onSync = (state, _previous, data) => {
                    if (state === sdk.SyncState.Prepared) resolve();
                    if (data?.error?.errcode === "M_UNKNOWN_TOKEN") reject(data.error);
                };
                this.client.on(sdk.ClientEvent.Sync, onSync);
                timer = setTimeout(() => reject(new Error(`Matrix sync timed out on ${this.serverUrl}`)), 30000);
                this.client.startClient({ initialSyncLimit: 1, disablePresence: true }).catch(reject);
            });
        } finally {
            clearTimeout(timer);
            this.client.off(sdk.ClientEvent.Sync, onSync);
        }
    }

    async resolveRoomId(roomAddress) {
        const address = normalizeMatrixRoomAddress(roomAddress);
        if (!address) throw new Error("Invalid Matrix room address");
        if (address.startsWith("!")) return address;

        try {
            const { room_id: roomId } = await this.client.getRoomIdForAlias(address);
            if (typeof roomId !== "string" || !roomId.startsWith("!")) {
                throw new Error("The Matrix server did not return a room ID");
            }
            return roomId;
        } catch (error) {
            throw new Error("Could not resolve Matrix room alias " + address + ": " + error.message, { cause: error });
        }
    }

    async roomUsesEncryption(roomId) {
        const room = this.client.getRoom(roomId);
        if (!room || room.getMyMembership() !== "join") {
            throw new Error(`Matrix bot must join room ${roomId} before sending`);
        }
        const crypto = this.client.getCrypto();
        const encrypted = room.hasEncryptionStateEvent() || await crypto?.isEncryptionEnabledInRoom(roomId);
        if (encrypted && !crypto) {
            throw new Error("Encrypted Matrix rooms require a token issued to a Matrix device. Log in as the bot to get a device token.");
        }
        return Boolean(encrypted);
    }

    async _sendEventWithRetry(sendFn, maxRetries = 3) {
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await sendFn();

                // 🛠️ Strict 600ms pacing delay after EVERY successful action to prevent Matrix HTTP 429
                await new Promise(resolve => setTimeout(resolve, 600));

                return response;
            } catch (err) {
                lastError = err;
                console.warn(`⚠️ Event dispatch failed on ${this.serverUrl} (attempt ${attempt}/${maxRetries}): ${err.message}`);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 3000 * attempt));
                }
            }
        }
        throw lastError;
    }

    async sendText(text, htmlText = null, roomId = null, transactionId) {
        if (!this.initialized || !this.client) throw new Error("Matrix client not initialized");

        try {
            const targetRoomId = await this.resolveRoomId(roomId || this.roomId);
            await this.roomUsesEncryption(targetRoomId);

            const content = { msgtype: "m.text", body: text };

            if (htmlText) {
                content.format = "org.matrix.custom.html";
                content.formatted_body = htmlText;
            }

            const response = await this._sendEventWithRetry(async () => {
                return await this.client.sendMessage(targetRoomId, content, transactionId);
            });

            console.log(`📝 Message sent to ${targetRoomId}: ${response.event_id}`);
            return response.event_id;
        } catch (err) {
            console.error(`❌ Failed to send text to ${roomId || this.roomId}:`, err.message);
            throw err;
        }
    }

    async sendFormatted(title, content, links = [], roomId = null) {
        const text = this._buildPlainText(title, content, links);
        const html = this._buildHtmlMessage(title, content, links);
        return await this.sendText(text, html, roomId);
    }

    async sendMedia(mediaBuffer, fileName, mimeType, caption = "", roomId = null, transactionId) {
        if (!this.initialized || !this.client) throw new Error("Matrix client not initialized");

        try {
            const targetRoomId = await this.resolveRoomId(roomId || this.roomId);

            const encrypted = await this.roomUsesEncryption(targetRoomId);
            const attachment = encrypted ? encryptAttachment(mediaBuffer) : null;
            console.log(`📤 Uploading media to ${this.serverUrl}: ${fileName}`);

            const uploadResponse = await this._sendEventWithRetry(async () => {
                return await this.client.uploadContent(attachment?.data || mediaBuffer, {
                    ...(encrypted ? { type: "application/octet-stream", includeFilename: false } : { type: mimeType, name: fileName }),
                    onlyContentUri: false,
                });
            });

            const mxcUrl = uploadResponse.content_uri;
            console.log(`✅ Media uploaded to ${this.serverUrl}: ${mxcUrl}`);

            const content = {
                msgtype: this._getMsgType(mimeType),
                ...(attachment ? { file: { ...attachment.file, url: mxcUrl } } : { url: mxcUrl }),
                body: fileName,
                info: {
                    mimetype: mimeType,
                    size: mediaBuffer.length,
                },
            };

            if (mimeType.startsWith("image/")) {
                content.info.h = 0;
                content.info.w = 0;
            }

            const response = await this._sendEventWithRetry(async () => {
                return await this.client.sendMessage(targetRoomId, content, transactionId);
            });
            console.log(`📦 Media sent to ${targetRoomId}: ${response.event_id}`);

            if (caption) {
                await this._sendEventWithRetry(async () => {
                    return await this.sendText(caption, null, targetRoomId, transactionId && `${transactionId}-caption`);
                });
            }

            return response.event_id;
        } catch (err) {
            console.error(`❌ Failed to send media to ${roomId || this.roomId}:`, err.message);
            throw err;
        }
    }

    async sendFile(filePath, mimeType, caption = "", roomId = null, fileName = path.basename(filePath), transactionId) {
        const buffer = await fs.readFile(filePath);
        return await this.sendMedia(buffer, fileName, mimeType, caption, roomId, transactionId);
    }

    async sendMessage(messageItem) {
        const { channel, title, text, messageId, timestamp, roomId, transactionId } = messageItem;
        const date = new Date(timestamp).toLocaleString("en-US", { timeZone: "Asia/Tehran" }) + " (IRAN TimeZone)";

        const formattedText = `💬 Message from ${(title || channel)}\n━━━━━━━━━━━━━━━━━━━\n${text}\n━━━━━━━━━━━━━━━━━━━\nID: ${messageId} | ${date}`.trim();
        const htmlText = `<strong>💬 Message from ${(title || channel)}</strong><br/><hr/><p>${text.replace(/\n/g, "<br/>")}</p><hr/><small>ID: ${messageId} | ${date}</small>`.trim();

        return await this.sendText(formattedText, htmlText, roomId, transactionId);
    }

    async sendMediaFile(mediaItem) {
        const { channel, title, filePath, fileName, mimeType, messageId, timestamp, roomId, transactionId } = mediaItem;
        const date = new Date(timestamp).toLocaleString("en-US", { timeZone: "Asia/Tehran" }) + " (IRAN TimeZone)";
        const caption = `📦 Media from ${(title || channel)}\nID: ${messageId} | ${date}`;

        return await this.sendFile(filePath, mimeType, caption, roomId, fileName, transactionId);
    }

    _getMsgType(mimeType) {
        if (mimeType.startsWith("image/")) return "m.image";
        if (mimeType.startsWith("video/")) return "m.video";
        if (mimeType.startsWith("audio/")) return "m.audio";
        return "m.file";
    }

    _buildPlainText(title, content, links = []) {
        let text = `${title}\n${"━".repeat(Math.min(title.length, 30))}\n${content}\n`;
        if (links.length > 0) {
            text += `\nLinks:\n`;
            for (const link of links) text += `  • ${link}\n`;
        }
        return text;
    }

    _buildHtmlMessage(title, content, links = []) {
        let html = `<strong>${title}</strong><br/><hr/><p>${content.replace(/\n/g, "<br/>")}</p>`;
        if (links.length > 0) {
            html += `<strong>Links:</strong><br/><ul>`;
            for (const link of links) html += `<li><code>${link.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></li>`;
            html += `</ul>`;
        }
        return html;
    }

    isInitialized() {
        return this.initialized && this.client !== null;
    }

    getDeviceVerification() {
        if (!this.isInitialized() || !this.client.getDeviceId() || !this.client.getCrypto()) return null;
        this.deviceVerification ??= new MatrixDeviceVerification(this.client);
        return this.deviceVerification;
    }

    async stop() {
        this.deviceVerification?.stop();
        this.deviceVerification = null;
        if (this.client) {
            try {
                await this.client.stopClient();
                console.log(`✅ Matrix client stopped for ${this.serverUrl}`);
            } catch (err) {}
        }
        activeCryptoStores.delete(this.cryptoStorePrefix);
        this.cryptoStorePrefix = undefined;
        this.initialized = false;
    }
}

/**
 * MatrixBotService
 * Multi-Server Matrix Manager & Client Cache
 * Routes channels to specific Matrix servers with fallback to default credentials.
 */
export class MatrixBotService {
    constructor() {
        this.clients = new Map();
        this.devices = new Map();
        this.defaultClient = null;
        this.defaultConfig = null;

        // Backward compatibility properties
        this.client = null;
        this.roomId = null;
        this.initialized = false;
        this.userId = null;
    }

    /**
     * Initializes default Matrix bot client
     */
    async initialize(config) {
        if (this.initialized && this.defaultClient) {
            console.log("✅ Matrix bot already initialized");
            return;
        }

        this.defaultConfig = config;
        this.defaultClient = await this.connect(config);

        // Sync backward compatibility properties
        this.client = this.defaultClient.client;
        this.userId = this.defaultClient.userId;
        this.roomId = this.defaultClient.roomId;
        this.initialized = true;

        console.log("✅ Default Matrix bot service ready");
    }

    connect(config) {
        const client = new MatrixBotClient(config);
        const key = credentialKey(client.serverUrl, client.token);
        if (!this.clients.has(key)) {
            this.clients.set(key, this.connectDevice(client, key).catch(error => {
                this.clients.delete(key);
                throw error;
            }));
        }
        return this.clients.get(key);
    }

    async retireUnusedConnection(config) {
        const serverUrl = normalizeMatrixServerUrl(config.serverUrl);
        const token = config.accessToken;
        const key = credentialKey(serverUrl, token);
        const cached = this.clients.get(key);
        if (!cached || token === process.env.MATRIX_BOT_TOKEN ||
            await MatrixServer.exists({ accessToken: token })) return;

        const client = await cached.catch(() => null);
        if (!client || client === this.defaultClient || this.clients.get(key) !== cached) return;
        this.clients.delete(key);
        const prefix = client.cryptoStorePrefix;
        const device = this.devices.get(prefix);
        if (device && await device.catch(() => null) === client && this.devices.get(prefix) === device) {
            this.devices.delete(prefix);
        }
        await client.stop();
    }

    async connectDevice(candidate, credentialKey) {
        const identity = await candidate.identify();
        const deviceKey = candidate.deviceKey(identity);
        const existing = this.devices.get(deviceKey);
        candidate.credentialKey = credentialKey;
        const initialization = (async () => {
            if (existing) {
                const previous = await existing.catch(() => null);
                if (previous) {
                    this.clients.delete(previous.credentialKey);
                    await previous.stop();
                }
            }
            await candidate.initialize(identity);
            return candidate;
        })();
        if (deviceKey) this.devices.set(deviceKey, initialization);
        try {
            return await initialization;
        } catch (error) {
            if (this.devices.get(deviceKey) === initialization) this.devices.delete(deviceKey);
            throw error;
        }
    }

    async getClientForServer(serverInfo) {
        if (!serverInfo) {
            if (!this.defaultClient && process.env.MATRIX_SERVER_URL && process.env.MATRIX_BOT_TOKEN) {
                await this.initialize({
                    serverUrl: process.env.MATRIX_SERVER_URL,
                    token: process.env.MATRIX_BOT_TOKEN,
                    roomId: process.env.MATRIX_TARGET_ROOM,
                });
            }
            return this.defaultClient;
        }

        const config = typeof serverInfo === "string" || serverInfo._bsontype === "ObjectId"
            ? await MatrixServer.findById(serverInfo)
            : serverInfo;
        if (!config || config.isActive === false) throw new Error("Matrix server is missing or inactive");
        return await this.connect(config);
    }

    async sendText(text, htmlText = null, roomId = null, serverInfo = null) {
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendText(text, htmlText, roomId);
    }

    async sendFormatted(title, content, links = [], roomId = null, serverInfo = null) {
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendFormatted(title, content, links, roomId);
    }

    async sendMedia(mediaBuffer, fileName, mimeType, caption = "", roomId = null, serverInfo = null) {
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendMedia(mediaBuffer, fileName, mimeType, caption, roomId);
    }

    async sendFile(filePath, mimeType, caption = "", roomId = null, serverInfo = null) {
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendFile(filePath, mimeType, caption, roomId);
    }

    async sendMessage(messageItem) {
        const serverInfo = messageItem.server || messageItem.matrixServerId;
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendMessage(messageItem);
    }

    async sendMediaFile(mediaItem) {
        const serverInfo = mediaItem.server || mediaItem.matrixServerId;
        const client = await this.getClientForServer(serverInfo);
        if (!client) throw new Error("Matrix bot not initialized and no default client available");
        return await client.sendMediaFile(mediaItem);
    }

    isInitialized() {
        return this.initialized && (this.defaultClient ? this.defaultClient.isInitialized() : false);
    }

    async stop() {
        const clients = await Promise.allSettled(this.clients.values());
        await Promise.allSettled(clients.filter(result => result.status === "fulfilled").map(result => result.value.stop()));
        this.clients.clear();
        this.devices.clear();
        this.defaultClient = null;
        this.initialized = false;
        this.client = null;
    }

    async cleanup() {
        return await this.stop();
    }
}

let instance = null;

export function getMatrixBotService() {
    if (!instance) instance = new MatrixBotService();
    return instance;
}

export default getMatrixBotService;
