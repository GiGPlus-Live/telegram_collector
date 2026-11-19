import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";
import MatrixChannel from "./MatrixChannel.js";
import MatrixServer from "./MatrixServer.js";

export function normalizeChannelUsername(val, doc) {
    if (!val || typeof val !== "string") return val;
    let u = val.trim();

    // Check if it's an invite link like https://t.me/+joinhash or https://t.me/joinchat/hash
    if (u.includes("joinchat/") || u.includes("/+")) {
        if (doc && !doc.inviteLink) {
            doc.inviteLink = u.startsWith("http") ? u : `https://${u.replace(/^@/, "")}`;
        }
        const match = u.match(/(?:joinchat\/|\/\+)([a-zA-Z0-9_-]+)/);
        const hash = match ? match[1] : u;
        return `+${hash}`;
    }

    // Normalize standard username / link
    u = u
        .replace(/^https?:\/\//i, "")
        .replace(/^(?:www\.)?(?:t\.me|telegram\.me)\//i, "")
        .replace(/^@/, "")
        .replace(/\/+$/, "");

    if (u.startsWith("joinchat/")) {
        if (doc && !doc.inviteLink) doc.inviteLink = `https://t.me/${u}`;
        u = "+" + u.replace("joinchat/", "");
    } else if (u.startsWith("+")) {
        if (doc && !doc.inviteLink) doc.inviteLink = `https://t.me/${u}`;
    }

    return u;
}

const ChannelSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            index: true,
            set: function (val) {
                return normalizeChannelUsername(val, this);
            },
        },
        title: { type: String, default: "" },

        enabled: { type: Boolean, default: true },
        checkIntervalSec: { type: Number, default: 60, min: 10 },

        // Matrix Channels mapping (many-to-many: one telegram channel can route to multiple Matrix channels)
        matrixChannelIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: MatrixChannel,
            },
        ],

        // Room IDs fallback (for backward compatibility or direct rooms)
        roomIds: { type: [String], default: [] },

        lastMessageId: { type: Number, default: 0 },
        pollingInitialized: { type: Boolean, default: false },

        matrixServerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: MatrixServer,
            default: null,
        },
        telegramAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "TelegramAccount",
            default: null,
        },
        inviteLink: { type: String, default: "" },

        // Telegram Download media constraints (per channel)
        mediaSettings: {
            telegram: {
                textOnly: { type: Boolean, default: false },
                maxMb: { type: Number, default: 0 }, // 0 = unlimited
                perCategory: {
                    photos: {
                        enabled: { type: Boolean, default: true },
                        maxMb: { type: Number, default: 0 },
                    },
                    videos: {
                        enabled: { type: Boolean, default: true },
                        maxMb: { type: Number, default: 10 },
                    },
                    audio: {
                        enabled: { type: Boolean, default: true },
                        maxMb: { type: Number, default: 5 },
                    },
                    documents: {
                        enabled: { type: Boolean, default: false },
                        maxMb: { type: Number, default: 0 },
                    },
                    stickers: {
                        enabled: { type: Boolean, default: false },
                        maxMb: { type: Number, default: 0 },
                    },
                },
            },
        },
    },
    { timestamps: true }
);

ChannelSchema.pre("validate", function (next) {
    if (this.username) {
        this.username = normalizeChannelUsername(this.username, this);
    }
    next();
});

export default getCollectorDatabase("telegram").model("Channel", ChannelSchema);
