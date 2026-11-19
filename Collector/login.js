import dotenv from "dotenv";
import mongoose from "mongoose";
import { __dirname } from "../app.js";
import { createTelegramClient } from "./tg.client.js";
import { migrateLegacyDatabase } from "../Utils/databaseMigration.js";
import { getDatabaseUri } from "../Utils/databaseConfig.js";

dotenv.config({ path: `${__dirname}/.env` });

(async () => {
    await mongoose.connect(getDatabaseUri());
    await migrateLegacyDatabase();

    const { client, session } = await createTelegramClient();
    const me = await client.getMe();

    console.log("✅ Logged in as:", me.username || me.firstName, String(me.id));
    const { default: TelegramAccount } = await import("../Models/TelegramAccount.js");
    await TelegramAccount.findOneAndUpdate(
        { phone: process.env.PHONE },
        { session, apiId: Number(process.env.API_ID), apiHash: process.env.API_HASH, isActive: true },
        { upsert: true }
    );
    console.log("Telegram session saved to MongoDB.");

    await client.disconnect();
    await mongoose.disconnect();
    process.exit(0);
})();
