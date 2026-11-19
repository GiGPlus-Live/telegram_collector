import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import S3StorageAdapter from "./adapters/S3StorageAdapter.js";
import MinIOStorageAdapter from "./adapters/MinIOStorageAdapter.js";

/**
 * Storage Adapter Factory
 * Creates and initializes the appropriate storage adapter
 */
export class StorageFactory {
    /**
     * Create and initialize storage adapter
     * @param {Object} config - Configuration object
     * @param {string} config.adapter - Adapter type (local, s3, minio)
     * @param {Object} config - Additional config for the adapter
     * @returns {Promise<StorageAdapter>}
     */
    static async createAdapter(config = {}) {
        const adapterType = config.adapter || process.env.STORAGE_ADAPTER || "local";
        
        let adapter;

        switch (adapterType.toLowerCase()) {
            case "local":
                adapter = new LocalStorageAdapter();
                break;
            
            case "s3":
                adapter = new S3StorageAdapter();
                break;
            
            case "minio":
                adapter = new MinIOStorageAdapter();
                break;
            
            default:
                console.warn(`⚠️ Unknown adapter type: ${adapterType}, falling back to local`);
                adapter = new LocalStorageAdapter();
        }

        await adapter.initialize(config);
        return adapter;
    }

    /**
     * List available adapters
     * @returns {Array<string>}
     */
    static getAvailableAdapters() {
        return ["local", "s3", "minio"];
    }
}

export default StorageFactory;
