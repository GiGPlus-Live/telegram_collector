/**
 * Abstract Storage Adapter Interface
 * All storage implementations should extend this class
 */
export class StorageAdapter {
    /**
     * Initialize the adapter with configuration
     * @param {Object} config - Configuration object
     * @returns {Promise<void>}
     */
    async initialize(config) {
        throw new Error("initialize() must be implemented");
    }

    /**
     * Save text content to storage
     * @param {string} key - Storage key/path (e.g., "news/channel1/2024-01-15/10/12-34-56_123.txt")
     * @param {string} content - Text content to save
     * @returns {Promise<void>}
     */
    async saveText(key, content) {
        throw new Error("saveText() must be implemented");
    }

    /**
     * Save binary content to storage
     * @param {string} key - Storage key/path (e.g., "vpn/npvt/channel1/2024-01-15/10/12-34-56_123.npvt")
     * @param {Buffer} buffer - Binary data to save
     * @returns {Promise<void>}
     */
    async saveBinary(key, buffer) {
        throw new Error("saveBinary() must be implemented");
    }

    /**
     * Read text content from storage
     * @param {string} key - Storage key/path
     * @returns {Promise<string>}
     */
    async readText(key) {
        throw new Error("readText() must be implemented");
    }

    /**
     * Read binary content from storage
     * @param {string} key - Storage key/path
     * @returns {Promise<Buffer>}
     */
    async readBinary(key) {
        throw new Error("readBinary() must be implemented");
    }

    /**
     * List objects in storage with given prefix
     * @param {string} prefix - Prefix to search (e.g., "news/channel1/2024-01-15/")
     * @returns {Promise<Array>} Array of objects with {key, size, lastModified}
     */
    async list(prefix) {
        throw new Error("list() must be implemented");
    }

    /**
     * Delete object from storage
     * @param {string} key - Storage key/path
     * @returns {Promise<void>}
     */
    async delete(key) {
        throw new Error("delete() must be implemented");
    }

    /**
     * Check if object exists in storage
     * @param {string} key - Storage key/path
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        throw new Error("exists() must be implemented");
    }

    /**
     * Get URL for accessing the object (if applicable)
     * @param {string} key - Storage key/path
     * @param {number} expirySeconds - URL expiry time in seconds (optional)
     * @returns {Promise<string>}
     */
    async getUrl(key, expirySeconds = 3600) {
        throw new Error("getUrl() must be implemented");
    }

    /**
     * Cleanup/close connections
     * @returns {Promise<void>}
     */
    async cleanup() {
        // Optional: override in implementations if needed
    }

    /**
     * Get adapter type/name
     * @returns {string}
     */
    getAdapterType() {
        return this.constructor.name;
    }
}

export default StorageAdapter;
