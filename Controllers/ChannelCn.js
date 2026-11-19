import { HandleERROR } from "../Utils/httpErrors.js";
import Channel from "../Models/Channel.js";
import { notifyChannelsChanged } from "../Collector/polling.worker.js";

export const getAll = async (req, res, next) => {
    const channels = await Channel.find()
        .populate([
            "matrixServerId",
            "telegramAccountId",
            {
                path: "matrixChannelIds",
                populate: { path: "matrixServerId" },
            },
        ])
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        count: channels.length,
        data: channels,
    });
};

export const getOne = async (req, res, next) => {
    const channel = await Channel.findById(req.params.id)
        .populate([
            "matrixServerId",
            "telegramAccountId",
            {
                path: "matrixChannelIds",
                populate: { path: "matrixServerId" },
            },
        ]);

    if (!channel) {
        return next(new HandleERROR("Channel not found", 404));
    }

    return res.status(200).json({
        success: true,
        data: channel,
    });
};

export const create = async (req, res, next) => {
    const {
        username,
        checkIntervalSec,
        enabled,
        roomIds,
        matrixChannelIds,
        matrixServerId,
        telegramAccountId,
        inviteLink,
        title,
        mediaSettings,
    } = req.body || {};

    if (!username) return next(new HandleERROR("username is required", 400));

    let normalized = String(username).trim();
    let detectedInviteLink = "";

    // Parse URL if provided
    if (normalized.includes("joinchat/") || normalized.includes("/+")) {
        detectedInviteLink = normalized.startsWith("http")
            ? normalized
            : `https://${normalized.replace(/^@/, "")}`;
        const match = normalized.match(/(?:joinchat\/|\/\+)([a-zA-Z0-9_-]+)/);
        const hash = match ? match[1] : normalized;
        normalized = `+${hash}`;
    } else {
        // Strip URL prefixes like https://t.me/, http://t.me/, t.me/, telegram.me/
        normalized = normalized
            .replace(/^https?:\/\//i, "")
            .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
            .replace(/^@/, "")
            .replace(/\/+$/, "");
    }

    if (checkIntervalSec !== undefined) {
        const n = Number(checkIntervalSec);
        if (Number.isNaN(n) || n < 10) {
            return next(new HandleERROR("checkIntervalSec must be a number >= 10", 400));
        }
    }

    const finalRoomIds = Array.isArray(roomIds) ? roomIds : [];
    const finalMatrixChannels = Array.isArray(matrixChannelIds) ? matrixChannelIds : [];

    const channelData = {
        username: normalized,
        title: title || "",
        checkIntervalSec: checkIntervalSec !== undefined ? Number(checkIntervalSec) : 60,
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        roomIds: finalRoomIds,
        matrixChannelIds: finalMatrixChannels,
        matrixServerId: matrixServerId || null,
        telegramAccountId: telegramAccountId || null,
        inviteLink: inviteLink || detectedInviteLink || "",
    };

    // Include mediaSettings for Telegram download
    if (mediaSettings && typeof mediaSettings === "object") {
        channelData.mediaSettings = {};
        if (mediaSettings.telegram) {
            channelData.mediaSettings.telegram = {
                textOnly: !!mediaSettings.telegram.textOnly,
                maxMb: Number(mediaSettings.telegram.maxMb) || 0,
                perCategory: mediaSettings.telegram.perCategory || {},
            };
        }
    }

    const channel = await Channel.create(channelData);
    notifyChannelsChanged();

    const populated = await Channel.findById(channel._id)
        .populate("matrixServerId")
        .populate("telegramAccountId")
        .populate({
            path: "matrixChannelIds",
            populate: { path: "matrixServerId" },
        });

    return res.status(201).json({
        message: "Channel created successfully",
        success: true,
        data: populated,
    });
};

export const update = async (req, res, next) => {
    const { id } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) return next(new HandleERROR("Channel not found", 404));

    const {
        username = null,
        title = null,
        enabled = null,
        checkIntervalSec = null,
        lastMessageId = null,
        roomIds = null,
        matrixChannelIds = null,
        matrixServerId = null,
        telegramAccountId = null,
        inviteLink = null,
        mediaSettings = null,
    } = req.body || {};

    const previousUsername = channel.username;
    if (username !== null) {
        let normalized = String(username).trim();
        if (normalized.includes("joinchat/") || normalized.includes("/+")) {
            if (!inviteLink && !channel.inviteLink) {
                channel.inviteLink = normalized.startsWith("http")
                    ? normalized
                    : `https://${normalized.replace(/^@/, "")}`;
            }
            const match = normalized.match(/(?:joinchat\/|\/\+)([a-zA-Z0-9_-]+)/);
            const hash = match ? match[1] : normalized;
            channel.username = `+${hash}`;
        } else {
            channel.username = normalized
                .replace(/^https?:\/\//i, "")
                .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
                .replace(/^@/, "")
                .replace(/\/+$/, "");
        }
    }

    if (checkIntervalSec !== null) {
        const n = Number(checkIntervalSec);
        if (Number.isNaN(n) || n < 10) {
            return next(new HandleERROR("checkIntervalSec must be a number >= 10", 400));
        }
        channel.checkIntervalSec = Number(checkIntervalSec);
    }

    if (previousUsername !== channel.username) {
        channel.lastMessageId = 0;
        channel.pollingInitialized = false;
    }
    if (lastMessageId !== null) {
        const n = Number(lastMessageId);
        if (!Number.isInteger(n) || n < 0) {
            return next(new HandleERROR("lastMessageId must be an integer >= 0", 400));
        }
        channel.lastMessageId = Number(lastMessageId);
        channel.pollingInitialized = true;
    }

    if (title !== null) channel.title = title;
    if (enabled !== null) channel.enabled = enabled;
    if (roomIds !== null && Array.isArray(roomIds)) {
        channel.roomIds = roomIds;
    }
    if (matrixChannelIds !== null && Array.isArray(matrixChannelIds)) {
        channel.matrixChannelIds = matrixChannelIds;
    }
    if (matrixServerId !== null) {
        channel.matrixServerId = matrixServerId || null;
    }
    if (telegramAccountId !== null) {
        channel.telegramAccountId = telegramAccountId || null;
    }
    if (inviteLink !== null) {
        channel.inviteLink = inviteLink;
    }

    if (mediaSettings !== null && typeof mediaSettings === "object") {
        if (!channel.mediaSettings) {
            channel.mediaSettings = {};
        }
        if (mediaSettings.telegram) {
            channel.mediaSettings.telegram = {
                textOnly: !!mediaSettings.telegram.textOnly,
                maxMb: Number(mediaSettings.telegram.maxMb) || 0,
                perCategory: mediaSettings.telegram.perCategory || {},
            };
        }
        channel.markModified("mediaSettings");
    }

    await channel.save();
    notifyChannelsChanged();

    const updated = await Channel.findById(channel._id)
        .populate("matrixServerId")
        .populate("telegramAccountId")
        .populate({
            path: "matrixChannelIds",
            populate: { path: "matrixServerId" },
        });

    return res.status(200).json({
        message: "Channel updated successfully",
        success: true,
        data: updated,
    });
};

export const remove = async (req, res, next) => {
    const { id } = req.params;

    const channel = await Channel.findById(id);
    if (!channel) return next(new HandleERROR("Channel not found", 404));

    await channel.deleteOne();
    notifyChannelsChanged();

    return res.status(204).json({
        message: "Channel deleted successfully",
        success: true,
    });
};
