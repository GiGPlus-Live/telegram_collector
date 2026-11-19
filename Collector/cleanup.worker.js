import fs from "fs/promises";
import path from "path";
import Setting from "../Models/Setting.js";

async function removeOldDirs(rootDir, maxAgeMs) {
    const now = Date.now();

    async function walk(dir) {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const fullPath = path.join(dir, entry.name);

            try {
                const stat = await fs.stat(fullPath);
                const age = now - stat.mtimeMs;

                if (age > maxAgeMs) {
                    await fs.rm(fullPath, { recursive: true, force: true });
                    console.log(`🧹 Deleted old folder: ${fullPath}`);
                } else {
                    await walk(fullPath);
                }
            } catch (e) {
                console.log(`⚠️ Cleanup error on ${fullPath}: ${e.message}`);
            }
        }
    }

    await walk(rootDir);
}

export async function startCleanupJob() {
    async function runOnce() {
        const setting = await Setting.findOne();
        const baseDir = process.env.COLLECTOR_STORAGE_ROOT || setting?.storageDir || process.env.STORAGE_DIR || "storage";
        const retentionHours = Number(setting?.retentionHours ?? 24);
        const maxAgeMs = retentionHours * 60 * 60 * 1000;

        console.log(`🧹 Cleanup run: baseDir=${baseDir} retentionHours=${retentionHours}`);
        await removeOldDirs(baseDir, maxAgeMs);

        return { retentionHours };
    }

    // اولین بار
    let { retentionHours } = await runOnce();

    // هر دفعه بعد از همون retentionHours دوباره اجرا می‌کنیم
    setInterval(async () => {
        try {
            // هر بار از DB می‌خونه (اگر تغییر دادی، اعمال میشه)
            const result = await runOnce();
            retentionHours = result.retentionHours;
        } catch (e) {
            console.log(`⚠️ Cleanup job error: ${e.message}`);
        }
    }, 60 * 60 * 1000); // ✅ هر 1 ساعت چک کن (بهتر از 24h ثابت)
}