import fs from "fs/promises";
import path from "path";
import { StorageAdapter } from "./StorageAdapter.interface.js";

/**
 * Local Filesystem Storage Adapter
 * Stores files on local filesystem
 */
export class LocalStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this.basePath = "./storage";
    }

    async initialize(config) {
        // config.storageDir - base directory for storage
        this.basePath = config?.storageDir || process.env.STORAGE_DIR || "./storage";
        
        // Ensure base directory exists
        await fs.mkdir(this.basePath, { recursive: true });
        console.log(`✅ LocalStorageAdapter initialized at: ${this.basePath}`);
    }

    async saveText(key, content) {
        const filePath = path.join(this.basePath, key);
        const dir = path.dirname(filePath);
        
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, "utf8");
        console.log(`📝 Text saved: ${key}`);
    }

    async saveBinary(key, buffer) {
        const filePath = path.join(this.basePath, key);
        const dir = path.dirname(filePath);
        
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, buffer);
        console.log(`📦 Binary saved: ${key}`);
    }

    async readText(key) {
        const filePath = path.join(this.basePath, key);
        return await fs.readFile(filePath, "utf8");
    }

    async readBinary(key) {
        const filePath = path.join(this.basePath, key);
        return await fs.readFile(filePath);
    }

    async list(prefix = "") {
        const fullPath = path.join(this.basePath, prefix);
        const results = [];

        try {
            const files = await fs.readdir(fullPath, { withFileTypes: true });
            
            for (const file of files) {
                const filePath = path.join(fullPath, file.name);
                const stats = await fs.stat(filePath);
                
                results.push({
                    key: path.join(prefix, file.name).replace(/\\/g, "/"),
                    size: stats.size,
                    lastModified: stats.mtime,
                    isDirectory: file.isDirectory(),
                });
            }
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
            // Return empty array if directory doesn't exist
        }

        return results;
    }

    async delete(key) {
        const filePath = path.join(this.basePath, key);
        try {
            await fs.unlink(filePath);
            console.log(`🗑️ Deleted: ${key}`);
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
            // File doesn't exist, ignore
        }
    }

    async exists(key) {
        const filePath = path.join(this.basePath, key);
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async getUrl(key, expirySeconds = 3600) {
        // For local storage, return file:// URL or relative path
        const filePath = path.join(this.basePath, key).replace(/\\/g, "/");
        return `file://${process.cwd()}/${filePath}`;
    }

    getAdapterType() {
        return "local";
    }
}

export default LocalStorageAdapter;
