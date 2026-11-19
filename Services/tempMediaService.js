import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { __dirname } from "../app.js";

/**
 * Temporary Media Storage Service
 * Stores media files temporarily during processing
 * Files are automatically cleaned up after use
 */
export class TempMediaService {
    constructor() {
        this.tempDir = path.join(__dirname, "temp");
        this.fileRegistry = new Map(); // Track files for cleanup
    }

    /**
     * Initialize temp storage
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
            console.log(`📦 Temp media storage initialized: ${this.tempDir}`);
        } catch (err) {
            console.error("❌ Failed to initialize temp storage:", err.message);
            throw err;
        }
    }

    /**
     * Save buffer to temporary file
     * @param {Buffer} buffer - File buffer
     * @param {string} fileName - Original file name (for extension)
     * @returns {Promise<Object>} - {filePath, fileId, cleanup: function}
     */
    async saveTempFile(buffer, fileName) {
        const fileId = this._generateId();
        const ext = path.extname(fileName) || "";
        const tempFileName = `${fileId}${ext}`;
        const tempFilePath = path.join(this.tempDir, tempFileName);

        try {
            await fs.writeFile(tempFilePath, buffer);
            
            const fileInfo = {
                filePath: tempFilePath,
                fileId,
                fileName: tempFileName,
                size: buffer.length,
                createdAt: new Date(),
            };

            // Track for cleanup
            this.fileRegistry.set(fileId, fileInfo);

            console.log(`📝 Temp file saved: ${tempFileName} (${buffer.length} bytes)`);

            return fileInfo;
        } catch (err) {
            console.error("❌ Failed to save temp file:", err.message);
            throw err;
        }
    }

    /**
     * Read temporary file
     * @param {string} filePath - Temp file path
     * @returns {Promise<Buffer>}
     */
    async readTempFile(filePath) {
        try {
            return await fs.readFile(filePath);
        } catch (err) {
            console.error("❌ Failed to read temp file:", err.message);
            throw err;
        }
    }

    /**
     * Delete temporary file
     * @param {string} fileId - File ID
     * @returns {Promise<void>}
     */
    async deleteTempFile(fileId) {
        const fileInfo = this.fileRegistry.get(fileId);
        
        if (!fileInfo) {
            console.warn(`⚠️ File not found in registry: ${fileId}`);
            return;
        }

        try {
            await fs.unlink(fileInfo.filePath);
            this.fileRegistry.delete(fileId);
            console.log(`🗑️ Temp file deleted: ${fileInfo.fileName}`);
        } catch (err) {
            if (err.code !== "ENOENT") console.error(`❌ Failed to delete temp file ${fileId}:`, err.message);
        } finally {
            this.fileRegistry.delete(fileId);
        }
    }

    /**
     * Cleanup all temporary files
     * @returns {Promise<void>}
     */
    async cleanupAll() {
        try {
            for (const [fileId, fileInfo] of this.fileRegistry) {
                try {
                    await fs.unlink(fileInfo.filePath);
                } catch (err) {
                    console.warn(`⚠️ Failed to delete: ${fileInfo.fileName}`);
                }
            }
            this.fileRegistry.clear();
            console.log(`🗑️ All temp files cleaned up`);
        } catch (err) {
            console.error("❌ Cleanup error:", err.message);
        }
    }

    /**
     * List all temporary files
     * @returns {Array<Object>}
     */
    listTempFiles() {
        return Array.from(this.fileRegistry.values());
    }

    /**
     * Get file info
     * @param {string} fileId - File ID
     * @returns {Object|null}
     */
    getFileInfo(fileId) {
        return this.fileRegistry.get(fileId) || null;
    }

    /**
     * Cleanup old temporary files (older than maxAgeHours)
     * @param {number} maxAgeHours - Max age in hours (default: 1 hour)
     * @returns {Promise<number>} - Number of files deleted
     */
    async cleanupOldFiles(maxAgeHours = 1) {
        const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
        let deleted = 0;
        const files = await fs.readdir(this.tempDir, { withFileTypes: true });
        for (const file of files) {
            if (!file.isFile() || !/^[a-f0-9]{16}(?:\..*)?$/.test(file.name)) continue;
            const fileId = file.name.slice(0, 16);
            if (this.fileRegistry.has(fileId)) continue;
            const filePath = path.join(this.tempDir, file.name);
            try {
                const { mtimeMs } = await fs.stat(filePath);
                if (mtimeMs >= cutoff) continue;
                await fs.unlink(filePath);
                deleted++;
            } catch (error) {
                if (error.code !== "ENOENT") console.warn("Failed to clean up stale temporary media:", error.code);
            }
        }

        if (deleted > 0) {
            console.log(`🗑️ Cleaned up ${deleted} old temp files`);
        }

        return deleted;
    }

    /**
     * Generate unique file ID
     * @private
     */
    _generateId() {
        return crypto.randomBytes(8).toString("hex");
    }
}

// Singleton instance
let tempMediaInstance = null;

/**
 * Get or create temp media service instance
 * @returns {TempMediaService}
 */
export function getTempMediaService() {
    if (!tempMediaInstance) {
        tempMediaInstance = new TempMediaService();
    }
    return tempMediaInstance;
}

export default getTempMediaService;
