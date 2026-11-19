import crypto from "crypto";
import QRCode from "qrcode";

// RFC 4648 Base32 Alphabet
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer to Base32 string
 */
export function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = "";

    for (let i = 0; i < buffer.length; i++) {
        value = (value << 8) | buffer[i];
        bits += 8;

        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

/**
 * Decodes a Base32 string to Buffer
 */
export function base32Decode(input) {
    const cleanInput = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
    let bits = 0;
    let value = 0;
    const output = [];

    for (let i = 0; i < cleanInput.length; i++) {
        const val = BASE32_ALPHABET.indexOf(cleanInput[i]);
        if (val === -1) continue;

        value = (value << 5) | val;
        bits += 5;

        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(output);
}

/**
 * Generates a random Base32 secret key (20 bytes = 160 bits, recommended by RFC 4226)
 */
export function generateTotpSecret(numBytes = 20) {
    const randomBytes = crypto.randomBytes(numBytes);
    return base32Encode(randomBytes);
}

/**
 * Generates a 6-digit TOTP code for a secret at a given timestamp
 */
export function generateTotpCode(secret, timestamp = Date.now(), step = 30) {
    const key = base32Decode(secret);
    const counter = Math.floor(timestamp / 1000 / step);

    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac("sha1", key);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0x0f;
    const code =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);

    const otp = (code % 1000000).toString().padStart(6, "0");
    return otp;
}

/**
 * Verifies a 6-digit TOTP code with time-drift tolerance (+- 1 step = 30 seconds)
 */
export function verifyTotpCode(secret, token, window = 1, step = 30) {
    if (!secret || !token) return false;
    const cleanToken = token.toString().trim();
    if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;

    const now = Date.now();
    for (let i = -window; i <= window; i++) {
        const testTime = now + i * step * 1000;
        const expectedCode = generateTotpCode(secret, testTime, step);
        if (expectedCode === cleanToken) {
            return true;
        }
    }
    return false;
}

/**
 * Generates an otpauth:// URI for Authenticator apps
 */
export function generateOtpauthUri(username, secret, issuer = "TelegramCollector") {
    const label = encodeURIComponent(`${issuer}:${username}`);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Standard Scannable QR Code SVG Generator
 * Returns self-contained SVG string that works offline in all browsers.
 */
export async function generateQrCodeSvg(text, size = 220) {
    try {
        const svg = await QRCode.toString(text, {
            type: "svg",
            width: size,
            margin: 2,
            color: {
                dark: "#000000",
                light: "#ffffff"
            }
        });
        return svg;
    } catch (e) {
        console.error("QR SVG generation error:", e);
        return `<div style="padding:16px;background:#fff;color:#000;text-align:center;border-radius:8px;"><code>${text}</code></div>`;
    }
}

/**
 * Generates Base64 DataURL for PNG QR code
 */
export async function generateQrCodeDataUrl(text, size = 220) {
    try {
        return await QRCode.toDataURL(text, {
            width: size,
            margin: 2
        });
    } catch (e) {
        console.error("QR DataURL generation error:", e);
        return "";
    }
}

