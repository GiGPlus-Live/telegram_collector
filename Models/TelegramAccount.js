import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const TelegramAccountSchema = new mongoose.Schema(
    {
        phone: { type: String, required: true, trim: true },
        apiId: { type: Number, required: true },
        apiHash: { type: String, required: true, trim: true },
        session: { type: String, default: "", trim: true },
        title: { type: String, default: "", trim: true },
        isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);



// Flexible getters / aliases
TelegramAccountSchema.virtual("sessionString").get(function () {
    return this.session;
});

export default getCollectorDatabase("telegram").model("TelegramAccount", TelegramAccountSchema);
