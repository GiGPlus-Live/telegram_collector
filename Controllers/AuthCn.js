import mongoose from "mongoose";
import AdminUser from "../Models/AdminUser.js";
import { hashPassword, verifyPassword, createToken } from "../Utils/authHelper.js";
import { generateTotpSecret, generateOtpauthUri, generateQrCodeSvg, generateQrCodeDataUrl, verifyTotpCode } from "../Utils/totpHelper.js";

/**
 * Login Controller
 * Supports standard username/password and 2FA step
 */
export const login = async (req, res) => {
    try {
        const { username, password, twoFactorCode } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "نام کاربری و رمز عبور الزامی است."
            });
        }

        // Fast-fail if MongoDB is not connected
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                message: "پایگاه داده (MongoDB) در دسترس نیست. لطفاً ابتدا کانتینر داکر (دستور docker compose up -d) یا سرویس MongoDB را اجرا نمایید."
            });
        }

        const normalizedUsername = username.toString().trim().toLowerCase();

        // Bootstrap the default administrator only on a fresh database.
        const totalAdmins = await AdminUser.countDocuments();
        if (totalAdmins === 0) {
            if (normalizedUsername !== "admin" || password !== "admin") {
                return res.status(401).json({
                    success: false,
                    message: "برای ورود اولیه، نام کاربری و رمز عبور هر دو admin هستند."
                });
            }
            const { hash, salt } = hashPassword(password);
            const initialAdmin = await AdminUser.create({
                username: normalizedUsername,
                passwordHash: hash,
                passwordSalt: salt,
                role: "admin",
                lastLogin: new Date()
            });

            const token = createToken({
                userId: initialAdmin._id,
                username: initialAdmin.username,
                role: initialAdmin.role
            });

            return res.status(200).json({
                success: true,
                message: "حساب کاربری مدیریت ایجاد و با موفقیت وارد شدید.",
                token,
                user: {
                    username: initialAdmin.username,
                    twoFactorEnabled: false
                }
            });
        }

        const user = await AdminUser.findOne({ username: normalizedUsername });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "نام کاربری یا رمز عبور اشتباه است."
            });
        }

        const isPasswordValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "نام کاربری یا رمز عبور اشتباه است."
            });
        }

        // Check 2FA
        if (user.twoFactorEnabled) {
            if (!twoFactorCode) {
                return res.status(200).json({
                    success: true,
                    needs2FA: true,
                    message: "ورود دومرحله‌ای فعال است. لطفاً کد ۶ رقمی را وارد کنید."
                });
            }

            const is2FAValid = verifyTotpCode(user.twoFactorSecret, twoFactorCode);
            if (!is2FAValid) {
                return res.status(400).json({
                    success: false,
                    needs2FA: true,
                    message: "کد تایید دومرحله‌ای اشتباه یا منقضی شده است."
                });
            }
        }

        user.lastLogin = new Date();
        await user.save();

        const token = createToken({
            userId: user._id,
            username: user.username,
            role: user.role
        });

        return res.status(200).json({
            success: true,
            message: "ورود موفقیت‌آمیز بود.",
            token,
            user: {
                username: user.username,
                twoFactorEnabled: user.twoFactorEnabled
            }
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({
            success: false,
            message: "خطای سرور در فرایند ورود."
        });
    }
};

/**
 * Get current authenticated user profile
 */
export const getMe = async (req, res) => {
    return res.status(200).json({
        success: true,
        user: {
            username: req.user.username,
            twoFactorEnabled: req.user.twoFactorEnabled,
            role: req.user.role,
            createdAt: req.user.createdAt,
            lastLogin: req.user.lastLogin
        }
    });
};

/**
 * Initiate 2FA Setup
 * Generates Secret, otpauth URL, and QR Code
 */
export const setup2FA = async (req, res) => {
    try {
        const user = await AdminUser.findById(req.user._id);
        const secret = generateTotpSecret(20);
        const otpauthUrl = generateOtpauthUri(user.username, secret, "TelegramCollector");
        const qrCodeSvg = await generateQrCodeSvg(otpauthUrl, 220);
        const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl, 220);

        user.tempTwoFactorSecret = secret;
        await user.save();

        return res.status(200).json({
            success: true,
            secret,
            otpauthUrl,
            qrCodeSvg,
            qrCodeDataUrl
        });
    } catch (err) {
        console.error("Setup 2FA error:", err);
        return res.status(500).json({
            success: false,
            message: "خطا در ایجاد اطلاعات ورود دومرحله‌ای."
        });
    }
};

/**
 * Confirm & Enable 2FA
 */
export const confirm2FA = async (req, res) => {
    try {
        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({
                success: false,
                message: "کد تایید ۶ رقمی الزامی است."
            });
        }

        const user = await AdminUser.findById(req.user._id);
        if (!user.tempTwoFactorSecret) {
            return res.status(400).json({
                success: false,
                message: "هیچ کلید فعالی برای تایید یافت نشد. لطفاً مجدداً تلاش کنید."
            });
        }

        const isValid = verifyTotpCode(user.tempTwoFactorSecret, code);
        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: "کد وارد شده اشتباه یا منقضی شده است."
            });
        }

        user.twoFactorSecret = user.tempTwoFactorSecret;
        user.twoFactorEnabled = true;
        user.tempTwoFactorSecret = "";
        await user.save();

        return res.status(200).json({
            success: true,
            message: "ورود دومرحله‌ای با موفقیت فعال شد!"
        });
    } catch (err) {
        console.error("Confirm 2FA error:", err);
        return res.status(500).json({
            success: false,
            message: "خطا در تایید کد دومرحله‌ای."
        });
    }
};

/**
 * Disable 2FA
 */
export const disable2FA = async (req, res) => {
    try {
        const { password, code } = req.body || {};

        const user = await AdminUser.findById(req.user._id);

        if (!password) {
            return res.status(400).json({
                success: false,
                message: "رمز عبور برای غیرفعال‌سازی ورود دومرحله‌ای الزامی است."
            });
        }

        const isPasswordValid = verifyPassword(password, user.passwordHash, user.passwordSalt);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "رمز عبور وارد شده اشتباه است."
            });
        }

        if (code && user.twoFactorSecret) {
            const isCodeValid = verifyTotpCode(user.twoFactorSecret, code);
            if (!isCodeValid) {
                return res.status(400).json({
                    success: false,
                    message: "کد دومرحله‌ای اشتباه است."
                });
            }
        }

        user.twoFactorEnabled = false;
        user.twoFactorSecret = "";
        user.tempTwoFactorSecret = "";
        await user.save();

        return res.status(200).json({
            success: true,
            message: "ورود دومرحله‌ای با موفقیت غیرفعال شد."
        });
    } catch (err) {
        console.error("Disable 2FA error:", err);
        return res.status(500).json({
            success: false,
            message: "خطا در غیرفعال‌سازی ورود دومرحله‌ای."
        });
    }
};

/**
 * Change Password
 */
export const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body || {};
        if (!oldPassword || !newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد."
            });
        }

        const user = await AdminUser.findById(req.user._id);
        const isOldValid = verifyPassword(oldPassword, user.passwordHash, user.passwordSalt);
        if (!isOldValid) {
            return res.status(400).json({
                success: false,
                message: "رمز عبور فعلی اشتباه است."
            });
        }

        const { hash, salt } = hashPassword(newPassword);
        user.passwordHash = hash;
        user.passwordSalt = salt;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "رمز عبور با موفقیت تغییر یافت."
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "خطا در تغییر رمز عبور."
        });
    }
};
