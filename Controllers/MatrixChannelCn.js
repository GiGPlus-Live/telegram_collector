import { HandleERROR } from "../Utils/httpErrors.js";
import MatrixChannel from "../Models/MatrixChannel.js";
import MatrixServer from "../Models/MatrixServer.js";
import Channel from "../Models/Channel.js";
import { normalizeMatrixRoomAddress } from "../Utils/matrixRoomAddress.js";

const invalidRoomAddress = "آدرس اتاق ماتریکس را به صورت #alias:server یا !roomId وارد کنید.";

export const getAll = async (req, res, next) => {
    const channels = await MatrixChannel.find()
        .populate("matrixServerId")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        count: channels.length,
        data: channels,
    });
};

export const getOne = async (req, res, next) => {
    const { id } = req.params;
    const channel = await MatrixChannel.findById(id).populate("matrixServerId");
    if (!channel) {
        return next(new HandleERROR("Matrix channel not found", 404));
    }
    return res.status(200).json({
        success: true,
        data: channel,
    });
};

export const create = async (req, res, next) => {
    const { name, roomId, matrixServerId, description, isActive, mediaSettings } = req.body || {};

    if (!name || !roomId || !matrixServerId) {
        return next(
            new HandleERROR("name, roomId, and matrixServerId are required", 400)
        );
    }

    const roomAddress = normalizeMatrixRoomAddress(roomId);
    if (!roomAddress) return next(new HandleERROR(invalidRoomAddress, 400));

    // Verify matrix server exists
    const server = await MatrixServer.findById(matrixServerId);
    if (!server) {
        return next(new HandleERROR("Selected Matrix server not found", 404));
    }

    const payload = {
        name: name.trim(),
        roomId: roomAddress,
        matrixServerId,
        description: description ? description.trim() : "",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
    };

    if (mediaSettings && typeof mediaSettings === "object") {
        payload.mediaSettings = {
            textOnly: Boolean(mediaSettings.textOnly),
            maxMb: Number(mediaSettings.maxMb) || 0,
            perCategory: {
                photos: {
                    enabled: mediaSettings.perCategory?.photos?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.photos?.maxMb) || 0,
                },
                videos: {
                    enabled: mediaSettings.perCategory?.videos?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.videos?.maxMb ?? 10),
                },
                audio: {
                    enabled: mediaSettings.perCategory?.audio?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.audio?.maxMb ?? 5),
                },
                documents: {
                    enabled: Boolean(mediaSettings.perCategory?.documents?.enabled),
                    maxMb: Number(mediaSettings.perCategory?.documents?.maxMb) || 0,
                },
                stickers: {
                    enabled: Boolean(mediaSettings.perCategory?.stickers?.enabled),
                    maxMb: Number(mediaSettings.perCategory?.stickers?.maxMb) || 0,
                },
            },
        };
    }

    const newChannel = await MatrixChannel.create(payload);
    const populated = await MatrixChannel.findById(newChannel._id).populate("matrixServerId");

    return res.status(201).json({
        success: true,
        message: "Matrix channel created successfully",
        data: populated,
    });
};

export const update = async (req, res, next) => {
    const { id } = req.params;
    const channel = await MatrixChannel.findById(id);
    if (!channel) {
        return next(new HandleERROR("Matrix channel not found", 404));
    }

    const { name, roomId, matrixServerId, description, isActive, mediaSettings } = req.body || {};

    if (name !== undefined) channel.name = name.trim();
    if (roomId !== undefined) {
        const roomAddress = normalizeMatrixRoomAddress(roomId);
        if (!roomAddress) return next(new HandleERROR(invalidRoomAddress, 400));
        channel.roomId = roomAddress;
    }
    if (matrixServerId !== undefined) {
        const server = await MatrixServer.findById(matrixServerId);
        if (!server) return next(new HandleERROR("Selected Matrix server not found", 404));
        channel.matrixServerId = matrixServerId;
    }
    if (description !== undefined) channel.description = description.trim();
    if (isActive !== undefined) channel.isActive = Boolean(isActive);

    if (mediaSettings !== undefined && typeof mediaSettings === "object") {
        channel.mediaSettings = {
            textOnly: Boolean(mediaSettings.textOnly),
            maxMb: Number(mediaSettings.maxMb) || 0,
            perCategory: {
                photos: {
                    enabled: mediaSettings.perCategory?.photos?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.photos?.maxMb) || 0,
                },
                videos: {
                    enabled: mediaSettings.perCategory?.videos?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.videos?.maxMb ?? 10),
                },
                audio: {
                    enabled: mediaSettings.perCategory?.audio?.enabled !== false,
                    maxMb: Number(mediaSettings.perCategory?.audio?.maxMb ?? 5),
                },
                documents: {
                    enabled: Boolean(mediaSettings.perCategory?.documents?.enabled),
                    maxMb: Number(mediaSettings.perCategory?.documents?.maxMb) || 0,
                },
                stickers: {
                    enabled: Boolean(mediaSettings.perCategory?.stickers?.enabled),
                    maxMb: Number(mediaSettings.perCategory?.stickers?.maxMb) || 0,
                },
            },
        };
        channel.markModified("mediaSettings");
    }

    await channel.save();
    const updated = await MatrixChannel.findById(channel._id).populate("matrixServerId");

    return res.status(200).json({
        success: true,
        message: "Matrix channel updated successfully",
        data: updated,
    });
};

export const remove = async (req, res, next) => {
    const { id } = req.params;
    const channel = await MatrixChannel.findById(id);
    if (!channel) {
        return next(new HandleERROR("Matrix channel not found", 404));
    }

    // Remove reference from any Telegram Channels
    await Channel.updateMany(
        { matrixChannelIds: channel._id },
        { $pull: { matrixChannelIds: channel._id } }
    );

    await channel.deleteOne();

    return res.status(200).json({
        success: true,
        message: "Matrix channel removed successfully",
    });
};
