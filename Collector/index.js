import dotenv from "dotenv";
import mongoose from "mongoose";
import { getDatabaseUri } from "../Utils/databaseConfig.js";
import { migrateLegacyDatabase } from "../Utils/databaseMigration.js";
import { __dirname } from "../app.js";

import { getAccountManager } from "./accountManager.js";
import { startPolling } from "./polling.worker.js";
import { startCleanupJob } from "./cleanup.worker.js";

dotenv.config({ path: `${__dirname}/.env` });

(async () => {
    try {
        await mongoose.connect(getDatabaseUri(), { serverSelectionTimeoutMS: 3000 });
        await migrateLegacyDatabase();
        console.log("✅ Collector DB connected");

        // Initialize Telegram Multi-Account Client Manager (DB accounts with dynamic proxy)
        const accountManager = getAccountManager();
        await accountManager.initialize();
        console.log("✅ Telegram account manager ready");

        // Start polling across channels using the client pool
        await startPolling(accountManager);

        // Start storage cleanup job
        await startCleanupJob();
    } catch (err) {
        console.error("❌ Collector initialization error:", err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
