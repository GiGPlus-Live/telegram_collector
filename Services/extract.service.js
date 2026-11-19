export function extractVpnLinks(text = "") {
    if (!text) return [];

    // پروتکل‌هایی که می‌خوایم استخراج کنیم
    const patterns = [
        /vmess:\/\/[^\s]+/gi,
        /vless:\/\/[^\s]+/gi,
        /trojan:\/\/[^\s]+/gi,
        /ss:\/\/[^\s]+/gi,
    ];

    const found = patterns.flatMap((re) => text.match(re) || []);

    const cleaned = found
        .map((x) => x.trim())
        .map((x) => x.replace(/[)\]}>,.]+$/g, ""))
        .filter(Boolean);

    return [...new Set(cleaned)];
}