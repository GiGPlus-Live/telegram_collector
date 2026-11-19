import { Router } from "express";
import {
    getAll,
    handleSendCode,
    handleVerify2FA,
    handleVerifyCode,
    remove,
    toggleActive,
} from "../Controllers/TelegramAccountCn.js";

const telegramAccountRouter = Router();

// Auth routes
telegramAccountRouter.post("/auth/send-code", handleSendCode);
telegramAccountRouter.post("/auth/verify-code", handleVerifyCode);
telegramAccountRouter.post("/auth/verify-2fa", handleVerify2FA);

// Account management routes - support both root and /accounts
telegramAccountRouter.get("/", getAll);
telegramAccountRouter.get("/accounts", getAll);

telegramAccountRouter.patch("/:id/toggle", toggleActive);
telegramAccountRouter.patch("/accounts/:id", toggleActive);
telegramAccountRouter.patch("/:id", toggleActive);

telegramAccountRouter.delete("/accounts/:id", remove);
telegramAccountRouter.delete("/:id", remove);

export default telegramAccountRouter;
