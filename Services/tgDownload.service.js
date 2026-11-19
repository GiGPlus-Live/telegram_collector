import fs from "fs/promises";
import path from "path";

export async function downloadDocument(client, message, outPath) {
    // GramJS downloadMedia فایل رو به Buffer/Uint8Array می‌ده
    const data = await client.downloadMedia(message, {});
    if (!data) throw new Error("downloadMedia returned empty");

    // Support both old (file path) and new (buffer-only) API
    if (outPath) {
        // Legacy: save to file system (for backward compatibility)
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, data);
        return data;
    } else {
        // New: return buffer only
        return Buffer.from(data);
    }
}