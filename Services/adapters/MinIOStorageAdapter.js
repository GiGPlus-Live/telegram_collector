import { StorageAdapter } from "./StorageAdapter.interface.js";

/**
 * MinIO Storage Adapter Template
 * MinIO is an open-source S3-compatible object storage system
 * 
 * Installation:
 * npm install minio
 * 
 * Environment Variables Required:
 * - MINIO_ENDPOINT
 * - MINIO_PORT (default: 9000)
 * - MINIO_ACCESS_KEY
 * - MINIO_SECRET_KEY
 * - MINIO_BUCKET_NAME
 * - MINIO_USE_SSL (default: false)
 */
export class MinIOStorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this.minioClient = null;
        this.bucketName = null;
    }

    async initialize(config) {
        try {
            // Lazy import - only required if MinIO adapter is actually used
            const { Client } = await import("minio");

            this.bucketName = config?.bucketName || process.env.MINIO_BUCKET_NAME;

            if (!this.bucketName) {
                throw new Error("MINIO_BUCKET_NAME environment variable is required");
            }

            const endpoint = process.env.MINIO_ENDPOINT || "localhost";
            const port = parseInt(process.env.MINIO_PORT || "9000");
            const useSSL = process.env.MINIO_USE_SSL === "true";

            this.minioClient = new Client({
                endPoint: endpoint,
                port: port,
                useSSL: useSSL,
                accessKey: process.env.MINIO_ACCESS_KEY,
                secretKey: process.env.MINIO_SECRET_KEY,
            });

            // Ensure bucket exists
            const bucketExists = await this.minioClient.bucketExists(this.bucketName);
            if (!bucketExists) {
                await this.minioClient.makeBucket(this.bucketName, "us-east-1");
                console.log(`📦 Created MinIO bucket: ${this.bucketName}`);
            }

            console.log(`✅ MinIOStorageAdapter initialized for bucket: ${this.bucketName}`);
        } catch (err) {
            throw new Error(`Failed to initialize MinIOStorageAdapter: ${err.message}. Make sure 'minio' package is installed.`);
        }
    }

    async saveText(key, content) {
        const buffer = Buffer.from(content, "utf8");
        await this.minioClient.putObject(
            this.bucketName,
            key,
            buffer,
            buffer.length,
            { "Content-Type": "text/plain" }
        );
        console.log(`📝 Text saved to MinIO: ${key}`);
    }

    async saveBinary(key, buffer) {
        await this.minioClient.putObject(
            this.bucketName,
            key,
            buffer,
            buffer.length
        );
        console.log(`📦 Binary saved to MinIO: ${key}`);
    }

    async readText(key) {
        const dataStream = await this.minioClient.getObject(this.bucketName, key);
        return new Promise((resolve, reject) => {
            let data = "";
            dataStream.on("data", (chunk) => (data += chunk));
            dataStream.on("end", () => resolve(data));
            dataStream.on("error", reject);
        });
    }

    async readBinary(key) {
        const dataStream = await this.minioClient.getObject(this.bucketName, key);
        return new Promise((resolve, reject) => {
            const chunks = [];
            dataStream.on("data", (chunk) => chunks.push(chunk));
            dataStream.on("end", () => resolve(Buffer.concat(chunks)));
            dataStream.on("error", reject);
        });
    }

    async list(prefix = "") {
        const results = [];
        const objectsList = await this.minioClient.listObjects(this.bucketName, prefix, true);

        return new Promise((resolve, reject) => {
            objectsList.on("object", (obj) => {
                results.push({
                    key: obj.name,
                    size: obj.size,
                    lastModified: obj.lastModified,
                });
            });

            objectsList.on("error", reject);
            objectsList.on("end", () => resolve(results));
        });
    }

    async delete(key) {
        await this.minioClient.removeObject(this.bucketName, key);
        console.log(`🗑️ Deleted from MinIO: ${key}`);
    }

    async exists(key) {
        try {
            await this.minioClient.statObject(this.bucketName, key);
            return true;
        } catch (err) {
            if (err.code === "NotFound") return false;
            throw err;
        }
    }

    async getUrl(key, expirySeconds = 3600) {
        return await this.minioClient.presignedGetObject(
            this.bucketName,
            key,
            expirySeconds
        );
    }

    getAdapterType() {
        return "minio";
    }
}

export default MinIOStorageAdapter;
