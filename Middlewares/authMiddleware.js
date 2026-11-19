import { verifyToken } from "../Utils/authHelper.js";
import AdminUser from "../Models/AdminUser.js";

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "دسترسی غیرمجاز: لطفاً ابتدا وارد پنل شوید."
        });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
        return res.status(401).json({
            success: false,
            message: "نشست شما منقضی یا نامعتبر شده است. لطفاً مجدداً وارد شوید."
        });
    }

    try {
        const user = await AdminUser.findById(decoded.userId).select("-passwordHash -passwordSalt");
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "کاربر یافت نشد."
            });
        }

        req.user = user;
        req.role = user.role || "admin";
        next();
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "خطا در بررسی دسترسی"
        });
    }
};
