import MatrixServer from "../Models/MatrixServer.js";
import { getMatrixBotService } from "../Services/matrixBotService.js";
import { HandleERROR } from "../Utils/httpErrors.js";
import { requirePanelCredentialTransport } from "../Utils/panelCredentialTransport.js";

async function getVerification(serverId) {
    const server = await MatrixServer.findById(serverId);
    if (!server) throw new HandleERROR("سرور ماتریکس پیدا نشد.", 404);

    let bot;
    try {
        bot = await getMatrixBotService().connect(server);
    } catch {
        throw new HandleERROR("دستگاه Collector به ماتریکس وصل نشد. آدرس و توکن ذخیره‌شده را بررسی کنید.", 424);
    }
    const verification = bot.getDeviceVerification();
    if (!verification) throw new HandleERROR("این توکن به یک دستگاه رمزنگاری‌شدهٔ ماتریکس متصل نیست.", 409);
    if (verification.userId === server.userId && verification.deviceId !== server.deviceId) {
        await MatrixServer.updateOne(
            { _id: server._id, accessToken: server.accessToken, serverUrl: server.serverUrl, userId: server.userId },
            { $set: { deviceId: verification.deviceId } },
        );
    }
    return verification;
}

export const verificationStatus = async (req, res) => {
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.status());
};

export const startVerification = async (req, res) => {
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.start());
};

export const confirmVerification = async (req, res) => {
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.confirm(req.params.attemptId));
};

export const cancelVerification = async (req, res) => {
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.cancel(req.params.attemptId));
};

export const prepareRecoveryKey = async (req, res) => {
    requirePanelCredentialTransport(req);
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json({ recoveryKey: await verification.prepareRecovery() });
};

export const verifyRecoveryKey = async (req, res) => {
    requirePanelCredentialTransport(req);
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.verifyWithRecovery(req.body?.recoveryKey));
};

export const setupRecoveryKey = async (req, res) => {
    requirePanelCredentialTransport(req);
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.verifyWithRecovery(req.body?.recoveryKey, true));
};

export const prepareRecoveryReset = async (req, res) => {
    requirePanelCredentialTransport(req);
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json({ recoveryKey: await verification.prepareRecovery(true) });
};

export const resetRecoveryKey = async (req, res) => {
    requirePanelCredentialTransport(req);
    const verification = await getVerification(req.params.id);
    return res.set("Cache-Control", "no-store").json(await verification.resetRecovery(req.body || {}));
};
