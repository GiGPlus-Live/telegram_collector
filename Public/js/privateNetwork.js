export function isPrivateIPv4(value) {
    const address = (value || "").replace(/^::ffff:/i, "");
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return false;
    const octets = address.split(".").map(Number);
    if (octets.some(octet => octet > 255)) return false;
    const [first, second] = octets;
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function isLoopback(value) {
    return ["localhost", "127.0.0.1", "::1", "[::1]", "::ffff:127.0.0.1"].includes(value);
}
