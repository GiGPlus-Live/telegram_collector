export function normalizeMatrixServerUrl(value) {
    if (typeof value !== "string") return null;

    const address = value.trim();
    if (!address || address.startsWith("/") || /[\s\\?#]/u.test(address)) return null;

    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(address);
    const baseUrl = hasScheme ? address : `https://${address}`;
    if (!/^https?:\/\/[^/]/i.test(baseUrl)) return null;

    try {
        const parsed = new URL(baseUrl);
        if (!parsed.hostname || parsed.username || parsed.password) return null;
        return baseUrl.replace(/\/+$/, "");
    } catch {
        return null;
    }
}
