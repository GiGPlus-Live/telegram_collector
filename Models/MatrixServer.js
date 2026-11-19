import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const MatrixServerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        serverUrl: { type: String, required: true, trim: true },
        userId: { type: String, required: true, trim: true },
        accessToken: { type: String, required: true, trim: true },
        deviceId: { type: String, default: "", trim: true },
        defaultRoomId: { type: String, default: "", trim: true },
        isActive: { type: Boolean, default: true, index: true },
    },
    { timestamps: true }
);

// Virtuals / aliases for backward compatibility
MatrixServerSchema.virtual("token")
    .get(function () {
        return this.accessToken;
    })
    .set(function (v) {
        this.accessToken = v;
    });

MatrixServerSchema.virtual("baseUrl")
    .get(function () {
        return this.serverUrl;
    })
    .set(function (v) {
        this.serverUrl = v;
    });

export default getCollectorDatabase("matrix").model("MatrixServer", MatrixServerSchema);
