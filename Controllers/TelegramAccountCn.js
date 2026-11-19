import { HandleERROR } from "../Utils/httpErrors.js";
import TelegramAccount from "../Models/TelegramAccount.js";
import { sendCode, verifyCode, verify2FA } from "../Services/tgAuth.service.js";

export const handleSendCode = async (req, res, next) => {
    const { phone, apiId, apiHash } = req.body || {};

    try {
        const result = await sendCode({ phone, apiId, apiHash });
        return res.status(200).json({
            success: true,
            message: "Verification code sent successfully",
            loginToken: result.loginToken,
            data: result,
        });
    } catch (err) {
        return next(new HandleERROR(err.message || "Failed to send code", 400));
    }
};

export const handleVerifyCode = async (req, res, next) => {
    const { loginToken, code } = req.body || {};
    if (!loginToken || !code) {
        return next(new HandleERROR("loginToken and code are required", 400));
    }

    try {
        const result = await verifyCode({ loginToken, code });
        if (result.needs2FA) {
            return res.status(200).json({
                success: true,
                needs2FA: true,
                loginToken: result.loginToken,
                message: "Two-step verification (2FA) is required",
            });
        }

        return res.status(200).json({
            success: true,
            needs2FA: false,
            message: "Logged in successfully",
            data: result,
        });
    } catch (err) {
        return next(new HandleERROR(err.message || "Failed to verify code", 400));
    }
};

export const handleVerify2FA = async (req, res, next) => {
    const { loginToken, password } = req.body || {};
    if (!loginToken || !password) {
        return next(new HandleERROR("loginToken and password are required", 400));
    }

    try {
        const result = await verify2FA({ loginToken, password });
        return res.status(200).json({
            success: true,
            message: "Two-step verification completed successfully",
            data: result,
        });
    } catch (err) {
        return next(new HandleERROR(err.message || "Failed to verify 2FA password", 400));
    }
};

export const getAll = async (req, res, next) => {
    const accounts = await TelegramAccount.find().sort({ createdAt: -1 });
    return res.status(200).json({
        success: true,
        count: accounts.length,
        data: accounts,
    });
};

export const toggleActive = async (req, res, next) => {
    const { id } = req.params;
    const account = await TelegramAccount.findById(id);
    if (!account) {
        return next(new HandleERROR("Telegram account not found", 404));
    }

    account.isActive = !account.isActive;
    await account.save();

    return res.status(200).json({
        success: true,
        message: `Account ${account.isActive ? "activated" : "deactivated"} successfully`,
        data: account,
    });
};

export const remove = async (req, res, next) => {
    const { id } = req.params;
    const account = await TelegramAccount.findById(id);
    if (!account) {
        return next(new HandleERROR("Telegram account not found", 404));
    }

    await account.deleteOne();

    return res.status(200).json({
        success: true,
        message: "Telegram account deleted successfully",
    });
};
