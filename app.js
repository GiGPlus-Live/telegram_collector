import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { catchError, HandleERROR } from "./Utils/httpErrors.js";

import authRouter from "./Routes/Auth.js";
import channelRouter from "./Routes/Channel.js";
import settingRouter from "./Routes/Setting.js";
import telegramAccountRouter from "./Routes/TelegramAccount.js";
import matrixServerRouter from "./Routes/MatrixServer.js";
import matrixChannelRouter from "./Routes/MatrixChannel.js";
import { protect } from "./Middlewares/authMiddleware.js";

// Models for stats
import TelegramAccount from "./Models/TelegramAccount.js";
import Channel from "./Models/Channel.js";
import MatrixServer from "./Models/MatrixServer.js";
import MatrixChannel from "./Models/MatrixChannel.js";
import Setting from "./Models/Setting.js";

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
app.use(express.json());
app.use(morgan("dev"));
app.use(express.static(`${__dirname}/Public`));

// Auth routes (public / self-protected)
app.use("/api/auth", authRouter);

// System stats endpoint
app.get("/api/system/stats", protect, async (req, res) => {
    try {
        const [
            telegramAccountsCount,
            activeAccountsCount,
            channelsCount,
            activeChannelsCount,
            matrixServersCount,
            matrixChannelsCount,
            setting,
        ] = await Promise.all([
            TelegramAccount.countDocuments(),
            TelegramAccount.countDocuments({ $or: [{ isActive: true }, { enabled: true }] }),
            Channel.countDocuments(),
            Channel.countDocuments({ enabled: true }),
            MatrixServer.countDocuments(),
            MatrixChannel.countDocuments(),
            Setting.findOne(),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                telegramAccountsCount,
                activeAccountsCount,
                channelsCount,
                activeChannelsCount,
                matrixServersCount,
                matrixChannelsCount,
                proxyStatus: setting?.proxy?.enabled ? "فعال" : "غیرفعال",
                proxyType: setting?.proxy?.type || "none",
                systemHealth: "سالم (Online)",
                uptime: `${Math.floor(process.uptime() / 3600)} ساعت و ${Math.floor((process.uptime() % 3600) / 60)} دقیقه`,
            },
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// Protected API routes
app.use("/api/channels", protect, channelRouter);
app.use("/api/settings", protect, settingRouter);
app.use("/api/telegram", protect, telegramAccountRouter);
app.use("/api/matrix/servers", protect, matrixServerRouter);
app.use("/api/matrix/channels", protect, matrixChannelRouter);
// Backward compatibility for matrix servers
app.use("/api/matrix", protect, matrixServerRouter);

app.use((req, res, next) => {
    next(new HandleERROR("Not Found", 404));
});

app.use(catchError);

export default app;
