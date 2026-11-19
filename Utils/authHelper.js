import crypto from "crypto";
import { getCollectorDatabase } from "./databaseConfig.js";

let signingSecret;

export async function initializeSigningSecret() {
    if (process.env.JWT_SECRET) {
        signingSecret = process.env.JWT_SECRET;
        return;
    }
    const keys = getCollectorDatabase("auth").db.collection("servicekeys");
    const key = await keys.findOneAndUpdate(
        { _id: "web-session-signing-key" },
        { $setOnInsert: { secret: crypto.randomBytes(32).toString("hex") } },
        { upsert: true, returnDocument: "after" }
    );
    signingSecret = key.secret;
}

/**
 * Hashes a plain-text password using Scrypt with a unique random salt
 */
export function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return {
        hash: derivedKey.toString("hex"),
        salt: salt
    };
}

/**
 * Verifies a password against the stored hash and salt
 */
export function verifyPassword(password, storedHash, salt) {
    if (!password || !storedHash || !salt) return false;
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const candidateHash = derivedKey.toString("hex");
    return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(candidateHash, "hex"));
}

/**
 * Creates a signed token (compact HMAC SHA-256 JWT)
 */
export function createToken(payload, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
    const header = { alg: "HS256", typ: "JWT" };
    const fullPayload = {
        ...payload,
        iat: Date.now(),
        exp: Date.now() + expiresInMs
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

    const signature = crypto
        .createHmac("sha256", signingSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url");

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed token
 */
export function verifyToken(token) {
    if (!token || typeof token !== "string") return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = crypto
        .createHmac("sha256", signingSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest("base64url");

    if (signature !== expectedSignature) {
        return null; // Invalid signature
    }

    try {
        const payloadJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
        const payload = JSON.parse(payloadJson);

        if (payload.exp && Date.now() > payload.exp) {
            return null; // Expired
        }

        return payload;
    } catch (e) {
        return null;
    }
}
