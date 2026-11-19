import express from "express";
import { login, getMe, setup2FA, confirm2FA, disable2FA, changePassword } from "../Controllers/AuthCn.js";
import { protect } from "../Middlewares/authMiddleware.js";

const router = express.Router();

router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/2fa/setup", protect, setup2FA);
router.post("/2fa/confirm", protect, confirm2FA);
router.post("/2fa/disable", protect, disable2FA);
router.post("/change-password", protect, changePassword);

export default router;
