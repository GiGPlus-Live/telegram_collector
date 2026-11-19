export function normalizeMatrixRoomAddress(value) {
    if (typeof value !== "string") return null;

    const address = value.trim();
    const sigil = address[0];
    if (sigil !== "#" && sigil !== "!") return null;

    const separator = address.indexOf(":");
    const localpart = address.slice(1, separator === -1 ? undefined : separator);
    if (!localpart || address.includes("\0") || !address.isWellFormed()) return null;

    if (separator === -1) {
        return sigil === "!" && Buffer.byteLength(address) <= 255 ? address : null;
    }

    // Support addresses pasted with Markdown-escaped dots in the server name.
    const serverName = address.slice(separator + 1).replace(/\\\./g, ".");
    if (!serverName || /[\s/\\?#]/u.test(serverName)) return null;

    const normalized = sigil + localpart + ":" + serverName;
    return Buffer.byteLength(normalized) <= 255 ? normalized : null;
}
