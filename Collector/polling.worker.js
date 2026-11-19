import { createHash } from "node:crypto";
import { Api } from "telegram";
import Channel from "../Models/Channel.js";
import Delivery from "../Models/Delivery.js";
import Setting from "../Models/Setting.js";
import MatrixChannel from "../Models/MatrixChannel.js";
import { downloadDocument } from "../Services/tgDownload.service.js";
import { getMatrixBotService } from "../Services/matrixBotService.js";
import { getTempMediaService } from "../Services/tempMediaService.js";
import { normalizeChannelUsername } from "../Utils/channelHelper.js";

function channelKey(username) {
    const u = normalizeChannelUsername(username);
    return u.toLowerCase() || "unknown";
}

/**
 * Resolves global media configuration from MongoDB Setting with .env / standard defaults.
 */
export function resolveMediaConfig(setting) {
    const media = setting?.media || {};
    const textOnly = Boolean(media.textOnly);

    const getCategoryConfig = (category, defaultEnabled, envEnabledVar, envLimitVar) => {
        const cat = media[category];
        let enabled = defaultEnabled;
        if (cat && typeof cat.enabled === "boolean") {
            enabled = cat.enabled;
        } else if (process.env[envEnabledVar] !== undefined) {
            enabled = process.env[envEnabledVar] !== "false";
        }
        let maxMb = 0;
        if (cat && typeof cat.maxMb === "number") {
            maxMb = cat.maxMb;
        } else if (process.env[envLimitVar] !== undefined) {
            maxMb = Number(process.env[envLimitVar]) || 0;
        }
        return { enabled, maxMb, maxBytes: maxMb > 0 ? maxMb * 1024 * 1024 : 0 };
    };

    return {
        textOnly,
        photos: getCategoryConfig("photos", true, "DOWNLOAD_PHOTOS", "MAX_SIZE_MB_PHOTOS"),
        videos: getCategoryConfig("videos", true, "DOWNLOAD_VIDEOS", "MAX_SIZE_MB_VIDEOS"),
        audio: getCategoryConfig("audio", true, "DOWNLOAD_AUDIO", "MAX_SIZE_MB_AUDIO"),
        documents: getCategoryConfig("documents", false, "DOWNLOAD_DOCUMENTS", "MAX_SIZE_MB_DOCUMENTS"),
        stickers: getCategoryConfig("stickers", false, "DOWNLOAD_STICKERS", "MAX_SIZE_MB_STICKERS"),
    };
}

/**
 * Merges per-channel or per-matrix-channel media settings with global defaults.
 */
export function resolveEffectiveConfig(customSettings, globalConfig) {
    if (!customSettings) return globalConfig;

    const textOnly = typeof customSettings.textOnly === "boolean"
        ? customSettings.textOnly
        : globalConfig.textOnly;

    const maxMb = typeof customSettings.maxMb === "number" && customSettings.maxMb > 0
        ? customSettings.maxMb
        : 0;

    const perCat = customSettings.perCategory || {};
    const categories = ["photos", "videos", "audio", "documents", "stickers"];
    const result = { textOnly };

    for (const cat of categories) {
        const customCat = perCat instanceof Map ? perCat.get(cat) : perCat[cat];
        const globalCat = globalConfig[cat] || { enabled: true, maxMb: 0, maxBytes: 0 };

        let enabled = globalCat.enabled;
        let catMaxMb = globalCat.maxMb;

        if (customCat) {
            if (typeof customCat.enabled === "boolean") enabled = customCat.enabled;
            if (typeof customCat.maxMb === "number" && customCat.maxMb >= 0) catMaxMb = customCat.maxMb;
        }

        if (maxMb > 0 && (catMaxMb === 0 || catMaxMb > maxMb)) {
            catMaxMb = maxMb;
        }

        result[cat] = {
            enabled,
            maxMb: catMaxMb,
            maxBytes: catMaxMb > 0 ? catMaxMb * 1024 * 1024 : 0,
        };
    }

    return result;
}

function allowsMedia(config, category, size) {
    const rule = config[category];
    return !config.textOnly && rule.enabled && (!rule.maxBytes || size <= rule.maxBytes);
}

async function sendWithRetry(sendFn, maxRetries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await sendFn();
            return true;
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ Send attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            }
        }
    }
    throw lastError;
}

async function* groupMessages(messages, cursor) {
    let album = [];
    let albumId;
    for await (const message of messages) {
        if (!message?.id || message.id <= cursor) continue;
        const id = message.groupedId?.toString();
        if (album.length && id !== albumId) {
            yield album;
            album = [];
        }
        if (id) {
            albumId = id;
            album.push(message);
        } else {
            yield [message];
        }
    }
    if (album.length) yield album;
}

/**
 * Polls once for a given channel:
 * 1. Reads new messages from Telegram.
 * 2. Checks Telegram download limits (`effectiveTelegram`).
 * 3. Downloads media if allowed.
 * 4. Resolves destination Matrix Channels and direct room IDs.
 * 5. Applies Matrix upload limits per Matrix Channel (`effectiveMatrix`).
 * 6. Dispatches to Matrix room(s).
 */
export async function pollOnceForChannel(accountManagerOrClient, channelDoc, setting, matrixBot, tempMedia, globalMediaConfig) {
    const cleanUsername = normalizeChannelUsername(channelDoc.username);
    if (!cleanUsername) return { processed: 0, lastMessageId: channelDoc.lastMessageId || 0 };

    let client;
    try {
        client = accountManagerOrClient.getClientForChannel
            ? accountManagerOrClient.getClientForChannel(channelDoc)
            : accountManagerOrClient;
    } catch (e) {
        console.warn(`⚠️ Telegram client not available for channel @${cleanUsername}: ${e.message}`);
        return { processed: 0, lastMessageId: channelDoc.lastMessageId || 0 };
    }

    const peer = await client.getEntity(
        cleanUsername.startsWith("+") ? `tg://join?invite=${cleanUsername.slice(1)}` : cleanUsername
    );

    if (!channelDoc.lastMessageId && !channelDoc.pollingInitialized) {
        const latest = await client.invoke(new Api.messages.GetHistory({ peer, limit: 1 }));
        const lastMessageId = latest.messages?.[0]?.id || 0;
        const { matchedCount } = await Channel.updateOne(
            { _id: channelDoc._id, username: channelDoc.username, pollingInitialized: { $ne: true },
                $or: [{ lastMessageId: 0 }, { lastMessageId: { $exists: false } }] },
            { $set: { lastMessageId, pollingInitialized: true } }
        );
        return { processed: 0, lastMessageId: matchedCount ? lastMessageId : 0 };
    }

    const ck = channelKey(channelDoc.username);
    const ct = channelDoc.title || `@${ck}`;

    // Effective Telegram download config for this channel
    const effectiveTelegram = resolveEffectiveConfig(
        channelDoc?.mediaSettings?.telegram,
        globalMediaConfig
    );

    // Resolve Matrix destinations
    // A channel can target:
    // 1. matrixChannelIds (populated MatrixChannel docs or need to be populated)
    // 2. roomIds (direct fallback rooms)
    let matrixDestinations = [];

    if (channelDoc.matrixChannelIds && channelDoc.matrixChannelIds.length > 0) {
        // Find populated or load them
        for (const target of channelDoc.matrixChannelIds) {
            if (target?.roomId && target.isActive !== false && target.matrixServerId && target.matrixServerId.isActive !== false) {
                matrixDestinations.push({
                    type: "channel",
                    name: target.name,
                    roomId: target.roomId,
                    serverInfo: target.matrixServerId,
                    effectiveMatrix: resolveEffectiveConfig(target.mediaSettings, globalMediaConfig),
                });
            } else if (target && !target.roomId) {
                // Was not populated, query it
                const mxDoc = await MatrixChannel.findById(target).populate("matrixServerId");
                if (mxDoc && mxDoc.isActive !== false && mxDoc.matrixServerId && mxDoc.matrixServerId.isActive !== false) {
                    matrixDestinations.push({
                        type: "channel",
                        name: mxDoc.name,
                        roomId: mxDoc.roomId,
                        serverInfo: mxDoc.matrixServerId,
                        effectiveMatrix: resolveEffectiveConfig(mxDoc.mediaSettings, globalMediaConfig),
                    });
                }
            }
        }
    }

    // Direct roomIds fallback
    if (channelDoc.roomIds && channelDoc.roomIds.length > 0) {
        for (const rId of channelDoc.roomIds) {
            if (rId && !matrixDestinations.some((d) => d.roomId === rId)) {
                matrixDestinations.push({
                    type: "direct_room",
                    name: rId,
                    roomId: rId,
                    serverInfo: channelDoc.matrixServerId || null,
                    effectiveMatrix: globalMediaConfig,
                });
            }
        }
    }

    let lastSuccessfulId = channelDoc.lastMessageId || 0;
    let processedCount = 0;
    if (!matrixDestinations.length) return { processed: 0, lastMessageId: lastSuccessfulId };

    const channelId = String(channelDoc._id || ck);
    await Delivery.deleteMany({ channel: channelId, messageId: { $lte: lastSuccessfulId } });
    const messages = client.iterMessages(peer, { minId: lastSuccessfulId, reverse: true });

    for await (const group of groupMessages(messages, lastSuccessfulId)) {
        const highestId = Math.max(...group.map((m) => m.id));
        const downloadedMediaFiles = [];
        let finalCaption = "";
        let date = new Date();

        try {
            for (const msg of group) {
                if (msg.date) date = new Date(msg.date * 1000);
                if (msg.message && !finalCaption) finalCaption = msg.message;

                // Check media download
                if ((msg.media?.photo || msg.media?.document) && !effectiveTelegram.textOnly) {
                    let mediaCategory = "documents";
                    let fileSize = 0;
                    let mimeType = "application/octet-stream";
                    let fileName = `file_${msg.id}`;

                    if (msg.media.photo) {
                        mediaCategory = "photos";
                        mimeType = "image/jpeg";
                        fileName = `photo_${msg.id}.jpg`;
                        const sizes = msg.media.photo.sizes || [];
                        fileSize = Math.max(0, ...sizes.map(size =>
                            size.size || Math.max(0, ...(size.sizes || []))
                        ));
                    } else if (msg.media.document) {
                        const doc = msg.media.document;
                        fileSize = Number(doc.size) || 0;
                        mimeType = doc.mimeType || "application/octet-stream";

                        const attrs = doc.attributes || [];
                        const fileNameAttr = attrs.find((a) => a.className === "DocumentAttributeFilename");
                        if (fileNameAttr?.fileName) fileName = fileNameAttr.fileName;

                        if (mimeType === "image/webp" || attrs.some((a) => a.className === "DocumentAttributeSticker")) {
                            mediaCategory = "stickers";
                        } else if (mimeType.startsWith("video/")) {
                            mediaCategory = "videos";
                        } else if (mimeType.startsWith("audio/")) {
                            mediaCategory = "audio";
                        } else {
                            mediaCategory = "documents";
                        }
                    }

                    const canForward = (size) =>
                        allowsMedia(effectiveTelegram, mediaCategory, size) &&
                        matrixDestinations.some(dest => allowsMedia(dest.effectiveMatrix, mediaCategory, size));

                    if (!canForward(fileSize)) continue;

                    const buffer = await downloadDocument(client, msg);
                    if (!buffer.length || !canForward(buffer.length)) continue;

                    const { fileId, filePath } = await tempMedia.saveTempFile(buffer, fileName);
                    downloadedMediaFiles.push({
                        messageId: msg.id,
                        tempFileId: fileId,
                        filePath,
                        fileName,
                        mimeType,
                        mediaCategory,
                        fileSize: buffer.length,
                    });
                }
            }

            let failedDelivery;
            for (const dest of matrixDestinations) {
                const route = [channelId, ck, highestId, String(dest.serverInfo?._id || dest.serverInfo || ""), dest.roomId];
                const deliver = async (part, send) => {
                    const transactionId = createHash("sha256").update(JSON.stringify([...route, part])).digest("hex");
                    if (await Delivery.exists({ _id: transactionId })) return;
                    await sendWithRetry(() => send(transactionId));
                    await Delivery.updateOne({ _id: transactionId }, {
                        $setOnInsert: { channel: channelId, messageId: highestId },
                    }, { upsert: true });
                };

                try {
                    const media = downloadedMediaFiles.filter(file =>
                        allowsMedia(dest.effectiveMatrix, file.mediaCategory, file.fileSize)
                    );
                    const details = {
                        channel: ck,
                        title: ct,
                        messageId: highestId,
                        timestamp: date.getTime(),
                        roomId: dest.roomId,
                        server: dest.serverInfo,
                    };

                    for (const file of media) {
                        await deliver(file.messageId, transactionId => matrixBot.sendMediaFile({
                            ...details, filePath: file.filePath, fileName: file.fileName,
                            mimeType: file.mimeType, transactionId,
                        }));
                    }

                    if (finalCaption) {
                        const text = media.length ? `📸 Caption:\n${finalCaption}` : finalCaption;
                        await deliver("text", transactionId => matrixBot.sendMessage({
                            ...details, text, transactionId,
                        }));
                    }
                } catch (error) {
                    failedDelivery = error;
                }
            }
            if (failedDelivery) throw failedDelivery;

            const { matchedCount } = await Channel.updateOne(
                {
                    _id: channelDoc._id,
                    username: channelDoc.username,
                    lastMessageId: lastSuccessfulId || { $in: [0, null] },
                },
                { $set: { lastMessageId: highestId } }
            );
            if (!matchedCount) break;
            channelDoc.lastMessageId = highestId;
            lastSuccessfulId = highestId;
            processedCount += group.length;
            await Delivery.deleteMany({ channel: channelId, messageId: { $lte: highestId } });
        } catch (err) {
            console.error(`❌ Error processing album/message ending at ${highestId}: ${err.message}`);
            break;
        } finally {
            for (const mFile of downloadedMediaFiles) {
                await tempMedia.deleteTempFile(mFile.tempFileId).catch(error => {
                    console.warn("Failed to clean up temporary Telegram media:", error.message);
                });
            }
        }
    }

    return { processed: processedCount, lastMessageId: lastSuccessfulId };
}

/**
 * Main polling service entry point
 */
let wakePolling;

export function notifyChannelsChanged() {
    wakePolling?.();
}

export async function startPolling(accountManagerOrClient) {
    if (wakePolling) return;
    let setting = (await Setting.findOne()) || await Setting.create({});
    const matrixBot = getMatrixBotService();
    const tempMedia = getTempMediaService();
    await tempMedia.initialize();
    await tempMedia.cleanupOldFiles();

    const schedules = new Map();
    let timer;
    let scanning = false;
    let scanAgain = false;

    async function scanChannels() {
        scanning = true;
        try {
            const channels = await Channel.find({ enabled: true }).select("checkIntervalSec");
            const enabledIds = new Set(channels.map(channel => String(channel._id)));
            for (const [id, schedule] of schedules) {
                if (!enabledIds.has(id) && !schedule.running) schedules.delete(id);
            }

            const due = channels.filter(channel => {
                const schedule = schedules.get(String(channel._id));
                const intervalMs = Math.max(10, channel.checkIntervalSec || 60) * 1000;
                return !schedule || (!schedule.running && Date.now() - schedule.finishedAt >= intervalMs);
            });
            if (!due.length) return;

            setting = (await Setting.findOne()) || setting;
            await accountManagerOrClient.syncWithDb?.(setting);
            const globalMediaConfig = resolveMediaConfig(setting);

            for (const channel of due) {
                const schedule = { running: true, finishedAt: 0 };
                schedules.set(String(channel._id), schedule);
                Channel.findById(channel._id)
                    .populate({ path: "matrixChannelIds", populate: { path: "matrixServerId" } })
                    .then(fresh => fresh?.enabled && pollOnceForChannel(
                        accountManagerOrClient, fresh, setting, matrixBot, tempMedia, globalMediaConfig
                    ))
                    .catch(error => console.error(`Poll error for Telegram channel ${channel._id}: ${error.message}`))
                    .finally(() => {
                        schedule.finishedAt = Date.now();
                        schedule.running = false;
                    });
            }
        } catch (error) {
            console.error("Failed to refresh Telegram polling schedule:", error.message);
        } finally {
            scanning = false;
            timer = setTimeout(scanChannels, scanAgain ? 0 : 2000);
            scanAgain = false;
        }
    }

    wakePolling = () => {
        if (scanning) {
            scanAgain = true;
            return;
        }
        clearTimeout(timer);
        timer = setTimeout(scanChannels, 0);
    };
    wakePolling();

    // Periodic cleanup of temp media
    setInterval(async () => {
        try {
            await tempMedia.cleanupOldFiles(1);
        } catch (err) {
            console.error("❌ Cleanup error:", err.message);
        }
    }, 60 * 60 * 1000);
}
