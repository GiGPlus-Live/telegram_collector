import { HandleERROR } from "../Utils/httpErrors.js";
import Setting from "../Models/Setting.js";
import { getProxyTestAccount, testProxy } from "../Services/proxyTest.service.js";
import { buildGramJsProxy } from "../Services/tgProxy.service.js";

async function settingsResponse(setting) {
    const proxyTestAvailable = Boolean(setting.proxy?.enabled && await getProxyTestAccount());
    return { ...setting.toObject(), proxyTestAvailable };
}

export const getOne = async (req, res, next) => {
    let setting = await Setting.findOne();
    if (!setting) {
        setting = await Setting.create({});
    }

    return res.status(200).json({
        success: true,
        data: await settingsResponse(setting),
    });
};

export const update = async (req, res, next) => {
    let setting = await Setting.findOne();
    if (!setting) {
        setting = await Setting.create({});
    }

    const {
        storageDir = null,
        retentionHours = null,
        proxy = null,
        media = null,
    } = req.body || {};

    if (storageDir !== null) {
        if (typeof storageDir !== "string" || !storageDir.trim()) {
            return next(new HandleERROR("storageDir must be a non-empty string", 400));
        }
        setting.storageDir = storageDir.trim();
    }

    if (retentionHours !== null) {
        const n = Number(retentionHours);
        if (!Number.isFinite(n) || n < 1 || n > 24 * 30) {
            return next(new HandleERROR("retentionHours must be between 1 and 720", 400));
        }
        setting.retentionHours = n;
    }

    if (proxy && typeof proxy === "object") {
        if (proxy.type && !["none", "socks5", "socks4", "mtproto", "http"].includes(proxy.type)) {
            return next(new HandleERROR("proxy.type is invalid", 400));
        }
        if (proxy.port !== undefined && proxy.port !== null && proxy.port !== "") {
            const p = Number(proxy.port);
            if (Number.isNaN(p) || p < 0 || p > 65535) {
                return next(new HandleERROR("proxy.port is invalid", 400));
            }
        }

        const currentProxy = setting.proxy?.toObject ? setting.proxy.toObject() : (setting.proxy || {});
        setting.proxy = {
            ...currentProxy,
            ...proxy,
            enabled: proxy.enabled !== undefined ? Boolean(proxy.enabled) : (currentProxy.enabled || false),
            port: proxy.port !== undefined && proxy.port !== "" ? Number(proxy.port) : currentProxy.port,
        };
        try {
            buildGramJsProxy(setting.proxy);
        } catch (error) {
            return next(new HandleERROR(error.message, 400));
        }
    }

    if (media && typeof media === "object") {
        const currentMedia = setting.media?.toObject ? setting.media.toObject() : (setting.media || {});

        setting.media = {
            textOnly: media.textOnly !== undefined ? Boolean(media.textOnly) : (currentMedia.textOnly || false),
            photos: {
                enabled: media.photos?.enabled !== undefined ? Boolean(media.photos.enabled) : (currentMedia.photos?.enabled ?? true),
                maxMb: media.photos?.maxMb !== undefined ? Number(media.photos.maxMb) : (currentMedia.photos?.maxMb ?? 0),
            },
            videos: {
                enabled: media.videos?.enabled !== undefined ? Boolean(media.videos.enabled) : (currentMedia.videos?.enabled ?? true),
                maxMb: media.videos?.maxMb !== undefined ? Number(media.videos.maxMb) : (currentMedia.videos?.maxMb ?? 10),
            },
            audio: {
                enabled: media.audio?.enabled !== undefined ? Boolean(media.audio.enabled) : (currentMedia.audio?.enabled ?? true),
                maxMb: media.audio?.maxMb !== undefined ? Number(media.audio.maxMb) : (currentMedia.audio?.maxMb ?? 5),
            },
            documents: {
                enabled: media.documents?.enabled !== undefined ? Boolean(media.documents.enabled) : (currentMedia.documents?.enabled ?? false),
                maxMb: media.documents?.maxMb !== undefined ? Number(media.documents.maxMb) : (currentMedia.documents?.maxMb ?? 0),
            },
            stickers: {
                enabled: media.stickers?.enabled !== undefined ? Boolean(media.stickers.enabled) : (currentMedia.stickers?.enabled ?? false),
                maxMb: media.stickers?.maxMb !== undefined ? Number(media.stickers.maxMb) : (currentMedia.stickers?.maxMb ?? 0),
            },
        };
    }

    const newSetting = await setting.save();

    return res.status(200).json({
        message: "Setting updated successfully",
        success: true,
        data: await settingsResponse(newSetting),
    });
};

export const testProxyConnection = async (req, res, next) => {
    const setting = await Setting.findOne();
    if (!setting?.proxy?.enabled) {
        return next(new HandleERROR("برای تست، تنظیمات پروکسی را فعال و ذخیره کنید.", 400));
    }

    try {
        const { host, port, username, password, type, secret } = setting.proxy;
        const result = await testProxy({ host, port, username, password, type, secret });
        return res.status(200).json({
            success: true,
            message: "سرور تلگرام از طریق پروکسی پاسخ داد.",
            latencyMs: result.latencyMs,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: `Proxy test failed: ${err.message}`,
        });
    }
};
