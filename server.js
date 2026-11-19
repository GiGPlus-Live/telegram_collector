import app from "./app.js";
import mongoose from "mongoose";
import { getDatabaseUri } from "./Utils/databaseConfig.js";
import { migrateLegacyDatabase } from "./Utils/databaseMigration.js";
import { initializeSigningSecret } from "./Utils/authHelper.js";
import { getAccountManager } from "./Collector/accountManager.js";
import { startPolling } from "./Collector/polling.worker.js";
import { getMatrixBotService } from "./Services/matrixBotService.js";
import { startCleanupJob } from "./Collector/cleanup.worker.js";

mongoose.set("bufferTimeoutMS", 2500);

const PORT = Number(process.env.PORT) || 3080;
const MONGO_OPTS = { serverSelectionTimeoutMS: 3000 };

async function startCollectorEngine() {
    try {
        console.log("⚡ Starting Telegram Collector Engine...");
        const accountManager = getAccountManager();
        await accountManager.initialize();
        await startPolling(accountManager);
        await startCleanupJob();
        console.log("🚀 Telegram Collector Engine active and monitoring channels");
    } catch (err) {
        console.warn("⚠️ Telegram Collector Engine warning:", err.message);
    }
}

try {
    await mongoose.connect(getDatabaseUri(), MONGO_OPTS);
    await migrateLegacyDatabase();
    await initializeSigningSecret();
    console.log("MongoDB connected ✅");
} catch (error) {
    console.error("Database or session initialization failed:", error.name, error.code || "");
    process.exit(1);
}

const server = app.listen(PORT, () => {
    console.log(`🚀 Telegram Collector Web Panel running on http://localhost:${PORT}`);
});
let shuttingDown = false;
async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    const forceExit = setTimeout(() => process.exit(1), 8000);
    forceExit.unref();
    await Promise.allSettled([
        getAccountManager().disconnectAll(),
        getMatrixBotService().stop(),
    ]);
    await mongoose.disconnect();
    process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
await startCollectorEngine();
