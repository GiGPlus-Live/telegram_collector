export function getDatabaseUri() {
    const { DATA_BASE, MONGO_HOST = "127.0.0.1", MONGO_USER, MONGO_PASS, MONGO_DB = "telegram_collector" } = process.env;
    if (DATA_BASE) return DATA_BASE;

    const credentials = MONGO_USER && MONGO_PASS
        ? `${encodeURIComponent(MONGO_USER)}:${encodeURIComponent(MONGO_PASS)}@`
        : "";
    const authSource = credentials ? "?authSource=admin" : "";
    return `mongodb://${credentials}${MONGO_HOST}:27017/${encodeURIComponent(MONGO_DB)}${authSource}`;
}
import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export function getCollectorDatabase(area) {
    const uriDatabase = process.env.DATA_BASE?.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/)?.[1];
    const prefix = uriDatabase ? decodeURIComponent(uriDatabase) : process.env.MONGO_DB || "telegram_collector";
    return mongoose.connection.useDb(`${prefix}_${area}`, { useCache: true });
}

