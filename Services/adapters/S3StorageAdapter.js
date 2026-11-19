import { StorageAdapter } from "./StorageAdapter.interface.js";

/**
 * AWS S3 Storage Adapter Template
 * 
 * Installation:
 * npm install @aws-sdk/client-s3
 * 
 * Environment Variables Required:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION
 * - S3_BUCKET_NAME
 */
export class S3StorageAdapter extends StorageAdapter {
    constructor() {
        super();
        this.s3Client = null;
        this.bucketName = null;
    }

    async initialize(config) {
        try {
            // Lazy import - only required if S3 adapter is actually used
            const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
            const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
            
            this.S3Client = S3Client;
            this.PutObjectCommand = PutObjectCommand;
            this.GetObjectCommand = GetObjectCommand;
            this.ListObjectsV2Command = ListObjectsV2Command;
            this.DeleteObjectCommand = DeleteObjectCommand;
            this.HeadObjectCommand = HeadObjectCommand;
            this.getSignedUrl = getSignedUrl;

            this.bucketName = config?.bucketName || process.env.S3_BUCKET_NAME;
            
            if (!this.bucketName) {
                throw new Error("S3_BUCKET_NAME environment variable is required");
            }

            this.s3Client = new S3Client({
                region: process.env.AWS_REGION || "us-east-1",
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });

            console.log(`✅ S3StorageAdapter initialized for bucket: ${this.bucketName}`);
        } catch (err) {
            throw new Error(`Failed to initialize S3StorageAdapter: ${err.message}. Make sure @aws-sdk/client-s3 is installed.`);
        }
    }

    async saveText(key, content) {
        const command = new this.PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: content,
            ContentType: "text/plain",
        });

        await this.s3Client.send(command);
        console.log(`📝 Text saved to S3: ${key}`);
    }

    async saveBinary(key, buffer) {
        const command = new this.PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: buffer,
        });

        await this.s3Client.send(command);
        console.log(`📦 Binary saved to S3: ${key}`);
    }

    async readText(key) {
        const command = new this.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        const response = await this.s3Client.send(command);
        return await response.Body.transformToString();
    }

    async readBinary(key) {
        const command = new this.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        const response = await this.s3Client.send(command);
        return await response.Body.transformToByteArray();
    }

    async list(prefix = "") {
        const command = new this.ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: prefix,
        });

        const response = await this.s3Client.send(command);
        return (response.Contents || []).map((obj) => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
        }));
    }

    async delete(key) {
        const command = new this.DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        await this.s3Client.send(command);
        console.log(`🗑️ Deleted from S3: ${key}`);
    }

    async exists(key) {
        try {
            const command = new this.HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            await this.s3Client.send(command);
            return true;
        } catch (err) {
            if (err.name === "NotFound") return false;
            throw err;
        }
    }

    async getUrl(key, expirySeconds = 3600) {
        const command = new this.GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });

        return await this.getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
    }

    getAdapterType() {
        return "s3";
    }
}

export default S3StorageAdapter;
