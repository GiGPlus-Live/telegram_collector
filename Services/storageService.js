import StorageFactory from "./StorageFactory.js";

/**
 * Storage Service
 * High-level abstraction over storage adapters
 */
class StorageService {
    constructor() {
        this.adapter = null;
        this.initialized = false;
    }

    /**
     * Initialize storage service
     * @param {Object} config - Configuration
     * @returns {Promise<void>}
     */
    async initialize(config = {}) {
        if (this.initialized) {
            console.log("✅ Storage service already initialized");
            return;
        }

        try {
            this.adapter = await StorageFactory.createAdapter(config);
            this.initialized = true;
            console.log(`✅ Storage service initialized with adapter: ${this.adapter.getAdapterType()}`);
        } catch (err) {
            console.error("❌ Failed to initialize storage service:", err.message);
            throw err;
        }
    }

    /**
     * Ensure adapter is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.initialized || !this.adapter) {
            throw new Error("Storage service not initialized. Call initialize() first.");
        }
    }

    /**
     * Save text content
     * @param {string} filePath - File path/key
     * @param {string} content - Text content
     * @returns {Promise<void>}
     */
    async saveText(filePath, content) {
        this._ensureInitialized();
        await this.adapter.saveText(filePath, content);
    }

    /**
     * Save binary content
     * @param {string} filePath - File path/key
     * @param {Buffer} buffer - Binary data
     * @returns {Promise<void>}
     */
    async saveBinary(filePath, buffer) {
        this._ensureInitialized();
        await this.adapter.saveBinary(filePath, buffer);
    }

    /**
     * Read text content
     * @param {string} filePath - File path/key
     * @returns {Promise<string>}
     */
    async readText(filePath) {
        this._ensureInitialized();
        return await this.adapter.readText(filePath);
    }

    /**
     * Read binary content
     * @param {string} filePath - File path/key
     * @returns {Promise<Buffer>}
     */
    async readBinary(filePath) {
        this._ensureInitialized();
        return await this.adapter.readBinary(filePath);
    }

    /**
     * List files in directory/prefix
     * @param {string} prefix - Directory prefix
     * @returns {Promise<Array>}
     */
    async list(prefix = "") {
        this._ensureInitialized();
        return await this.adapter.list(prefix);
    }

    /**
     * Delete file
     * @param {string} filePath - File path/key
     * @returns {Promise<void>}
     */
    async delete(filePath) {
        this._ensureInitialized();
        await this.adapter.delete(filePath);
    }

    /**
     * Check if file exists
     * @param {string} filePath - File path/key
     * @returns {Promise<boolean>}
     */
    async exists(filePath) {
        this._ensureInitialized();
        return await this.adapter.exists(filePath);
    }

    /**
     * Get URL for file
     * @param {string} filePath - File path/key
     * @param {number} expirySeconds - URL expiry time
     * @returns {Promise<string>}
     */
    async getUrl(filePath, expirySeconds = 3600) {
        this._ensureInitialized();
        return await this.adapter.getUrl(filePath, expirySeconds);
    }

    /**
     * Get adapter type
     * @returns {string}
     */
    getAdapterType() {
        this._ensureInitialized();
        return this.adapter.getAdapterType();
    }

    /**
     * Cleanup
     * @returns {Promise<void>}
     */
    async cleanup() {
        if (this.adapter) {
            await this.adapter.cleanup();
            this.initialized = false;
        }
    }
}

// Singleton instance
let storageServiceInstance = null;

/**
 * Get or create storage service instance
 * @returns {StorageService}
 */
export function getStorageService() {
    if (!storageServiceInstance) {
        storageServiceInstance = new StorageService();
    }
    return storageServiceInstance;
}

export default getStorageService;
