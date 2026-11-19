import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const SettingSchema = new mongoose.Schema(
    {
        storageDir: { type: String, default: "storage" },
        retentionHours: { type: Number, default: 24, min: 1, max: 24 * 30 },
        proxy: {
            enabled: { type: Boolean, default: false },
            type: { type: String, enum: ["none", "socks5", "socks4", "http", "mtproto"], default: "none" },
            host: { type: String, default: null },
            port: { type: Number, default: null },
            username: { type: String, default: null },
            password: { type: String, default: null },
            secret: { type: String, default: null }
        },
        media: {
            textOnly: { type: Boolean, default: false },
            photos: {
                enabled: { type: Boolean, default: true },
                maxMb: { type: Number, default: 0 }
            },
            videos: {
                enabled: { type: Boolean, default: true },
                maxMb: { type: Number, default: 10 }
            },
            audio: {
                enabled: { type: Boolean, default: true },
                maxMb: { type: Number, default: 5 }
            },
            documents: {
                enabled: { type: Boolean, default: false },
                maxMb: { type: Number, default: 0 }
            },
            stickers: {
                enabled: { type: Boolean, default: false },
                maxMb: { type: Number, default: 0 }
            }
        }
    },
    { timestamps: true }
);

export default getCollectorDatabase("settings").model("Setting", SettingSchema);
