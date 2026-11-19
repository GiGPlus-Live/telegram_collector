import { HandleERROR } from "./httpErrors.js";
import { isLoopback, isPrivateIPv4 } from "../Public/js/privateNetwork.js";

export function requirePanelCredentialTransport(req) {
    let host, origin;
    try {
        host = new URL(`http://${req.get("Host")}`);
        origin = req.get("Origin") ? new URL(req.get("Origin")) : null;
    } catch {
        throw new HandleERROR("آدرس پنل برای ارسال اطلاعات ورود معتبر نیست.", 400);
    }

    if (req.secure || origin?.protocol === "https:") return;
    const peer = req.socket.remoteAddress;
    const direct = !req.get("Forwarded") && !req.get("X-Forwarded-For");
    const localPeer = isLoopback(peer) || isPrivateIPv4(peer);
    const matchesHost = !origin || (origin.protocol === "http:" && origin.host === host.host);
    if (direct && localPeer && matchesHost && isLoopback(host.hostname)) return;
    if (direct && localPeer && origin && matchesHost && isPrivateIPv4(host.hostname) && req.body?.allowLanHttp === true) return;

    throw new HandleERROR("پنل را با HTTPS، روی localhost یا با IP خصوصی خود سرور و تأیید استفاده از HTTP باز کنید.", 400);
}
