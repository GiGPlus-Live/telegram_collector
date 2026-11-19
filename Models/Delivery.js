import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const schema = new mongoose.Schema({
    _id: String,
    channel: { type: String, required: true },
    messageId: { type: Number, required: true },
}, { versionKey: false });

schema.index({ channel: 1, messageId: 1 });

export default getCollectorDatabase("delivery").model("Delivery", schema);
