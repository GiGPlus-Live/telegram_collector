/**
 * Normalizes a Telegram channel username or link into a clean username.
 * Strips https://t.me/, t.me/, telegram.me/, leading/trailing slashes, and '@' symbols.
 *
 * @param {string} input - Raw channel link or username
 * @returns {string} Clean channel username
 */
export function normalizeChannelUsername(input) {
    if (!input) return "";
    let clean = String(input).trim();

    // 1. Strip protocol: https:// or http://
    clean = clean.replace(/^https?:\/\//i, "");

    // 2. Strip telegram web domains: t.me/, telegram.me/, telegram.dog/
    clean = clean.replace(/^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\//i, "");

    // 3. Strip query strings and hash parameters (?foo=bar, #baz)
    clean = clean.split("?")[0].split("#")[0];

    // 4. Strip leading/trailing slashes or @ symbols
    clean = clean.replace(/^[/\\@]+/, "").replace(/[/\\@]+$/, "");

    // 5. If there are subpaths (e.g. channel_name/123), keep first component
    if (clean.includes("/")) {
        clean = clean.split("/")[0];
    }

    return clean.trim();
}

export default normalizeChannelUsername;
