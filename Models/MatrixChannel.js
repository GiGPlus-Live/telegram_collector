import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const MatrixChannelSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        roomId: { type: String, required: true, trim: true },
        matrixServerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MatrixServer",
            required: true,
        },
        description: { type: String, default: "" },
        isActive: { type: Boolean, default: true },
        mediaSettings: {
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
    { timestamps: true }
);

export default getCollectorDatabase("matrix").model("MatrixChannel", MatrixChannelSchema);
