import * as sdk from "matrix-js-sdk";
import { HandleERROR } from "../Utils/httpErrors.js";
import { normalizeMatrixServerUrl } from "../Utils/matrixServerUrl.js";
import { requirePanelCredentialTransport } from "../Utils/panelCredentialTransport.js";
import MatrixServer from "../Models/MatrixServer.js";
import { getMatrixBotService } from "../Services/matrixBotService.js";

const reconnectingServers = new Set();

function requireMatrixServerUrl(value) {
    const serverUrl = normalizeMatrixServerUrl(value);
    if (!serverUrl) {
        throw new HandleERROR("آدرس معتبر سرور ماتریکس را وارد کنید، مانند matrix.example.org یا https://matrix.example.org.", 400);
    }
    return serverUrl;
}

async function requestMatrixToken(serverUrl, userId, password, deviceId) {
    const response = await fetch(`${serverUrl}/_matrix/client/v3/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: String(userId).trim() },
            password: String(password),
            device_id: deviceId,
            initial_device_display_name: "Telegram Collector Bot",
        }),
        signal: AbortSignal.timeout(30000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(data?.error || data?.message || `کد خطا: ${response.status}`);
        error.matrixStatus = response.status;
        throw error;
    }
    if (typeof data?.access_token !== "string" || !data.access_token) {
        throw new Error("سرور ماتریکس توکن دسترسی برنگرداند.");
    }
    return data;
}

/**
 * Creates temporary Matrix client for testing / querying
 */
function createTempMatrixClient({ serverUrl, accessToken, userId }) {
    return sdk.createClient({
        baseUrl: requireMatrixServerUrl(serverUrl),
        accessToken,
        userId: userId || undefined,
        localTimeoutMs: 10000,
    });
}

/**
 * Fetches joined rooms and attempts to resolve room display names
 */
async function fetchRoomsForClient(client) {
    const res = await client.getJoinedRooms();
    const joinedRoomIds = res?.joined_rooms || [];

    const roomDetails = await Promise.all(
        joinedRoomIds.map(async (roomId) => {
            try {
                const state = await client.getStateEvent(roomId, "m.room.name");
                return {
                    roomId,
                    name: state?.name || roomId,
                };
            } catch {
                return {
                    roomId,
                    name: roomId,
                };
            }
        })
    );

    return {
        joinedRoomIds,
        rooms: roomDetails,
    };
}

export const getAll = async (req, res, next) => {
    const servers = await MatrixServer.find().sort({ createdAt: -1 });
    return res.status(200).json({
        success: true,
        count: servers.length,
        data: servers,
    });
};

export const getOne = async (req, res, next) => {
    const { id } = req.params;
    const server = await MatrixServer.findById(id);
    if (!server) {
        return next(new HandleERROR("Matrix server not found", 404));
    }
    return res.status(200).json({
        success: true,
        data: server,
    });
};

export const create = async (req, res, next) => {
    const { name, serverUrl: address, password, defaultRoomId, isActive } = req.body || {};
    let { userId, accessToken } = req.body || {};

    if (!name || !address || !userId) {
        return next(
            new HandleERROR("نام، آدرس سرور و شناسه کاربری الزامی است", 400)
        );
    }
    const serverUrl = requireMatrixServerUrl(address);
    let deviceId = "";

    // Automatically acquire accessToken using password if token not directly provided
    if (!accessToken && password) {
        try {
            const loginData = await requestMatrixToken(serverUrl, userId, password);
            accessToken = loginData.access_token;
            deviceId = loginData.device_id || "";
            if (loginData.user_id) userId = loginData.user_id;
        } catch (authErr) {
            return next(new HandleERROR(`خطا در ارتباط با سرور ماتریکس جهت دریافت توکن: ${authErr.message}`, 400));
        }
    }

    if (!accessToken) {
        return next(new HandleERROR("توکن دسترسی یا رمز عبور ربات الزامی است", 400));
    }

    const server = await MatrixServer.create({
        name: name.trim(),
        serverUrl,
        userId: userId.trim(),
        accessToken: accessToken.trim(),
        deviceId,
        defaultRoomId: defaultRoomId ? defaultRoomId.trim() : "",
        isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
        success: true,
        message: "Matrix server created successfully",
        data: server,
    });
};

export const update = async (req, res, next) => {
    const { id } = req.params;
    const server = await MatrixServer.findById(id);
    if (!server) {
        return next(new HandleERROR("Matrix server not found", 404));
    }

    const { name, serverUrl, userId, accessToken, defaultRoomId, isActive } = req.body || {};
    const previousCredentials = savedCredentials(server);

    if (name !== undefined) server.name = String(name).trim();
    if (serverUrl !== undefined) server.serverUrl = requireMatrixServerUrl(serverUrl);
    if (userId !== undefined) server.userId = String(userId).trim();
    if (accessToken !== undefined) server.accessToken = String(accessToken).trim();
    if (defaultRoomId !== undefined) server.defaultRoomId = String(defaultRoomId).trim();
    if (isActive !== undefined) server.isActive = Boolean(isActive);
    if (server.serverUrl !== previousCredentials.serverUrl || server.userId !== previousCredentials.userId ||
        server.accessToken !== previousCredentials.accessToken) {
        server.deviceId = "";
    }

    const updated = await server.save();

    return res.status(200).json({
        success: true,
        message: "Matrix server updated successfully",
        data: updated,
    });
};

function savedCredentials(server) {
    const { _id, serverUrl, userId, accessToken } = server;
    return { _id, serverUrl, userId, accessToken };
}

function matchesSavedAccount(savedId, actualId) {
    if (typeof actualId !== "string" || !actualId.startsWith("@") || !actualId.includes(":")) return false;
    return savedId.startsWith("@") ? actualId === savedId : actualId.slice(1, actualId.indexOf(":")) === savedId;
}

export const testSavedConnection = async (req, res) => {
    const server = await MatrixServer.findById(req.params.id);
    if (!server) throw new HandleERROR("سرور ماتریکس پیدا نشد.", 404);

    let identity;
    try {
        identity = await createTempMatrixClient(server).whoami();
    } catch (error) {
        if (error.httpStatus === 401 || error.errcode === "M_UNKNOWN_TOKEN") {
            return res.status(400).json({
                success: false,
                code: "MATRIX_RELOGIN_REQUIRED",
                message: "توکن این حساب دیگر معتبر نیست. از «ورود مجدد» برای همین سرور استفاده کنید.",
            });
        }
        throw new HandleERROR("ارتباط با سرور Matrix برقرار نشد. آدرس و اتصال شبکه را بررسی کنید.", 424);
    }
    if (!matchesSavedAccount(server.userId, identity.user_id)) {
        return res.status(400).json({
            success: false,
            code: "MATRIX_RELOGIN_REQUIRED",
            message: "توکن به حساب ذخیره‌شده تعلق ندارد. با همان حساب دوباره وارد شوید.",
        });
    }
    if (identity.device_id && identity.device_id !== server.deviceId) {
        await MatrixServer.updateOne(savedCredentials(server), { $set: { deviceId: identity.device_id } });
    }
    return res.json({ success: true, message: "دسترسی حساب ذخیره‌شده به Matrix تأیید شد." });
};

export const reconnect = async (req, res) => {
    requirePanelCredentialTransport(req);
    const { password } = req.body || {};
    if (typeof password !== "string" || !password || password.length > 1024) {
        throw new HandleERROR("رمز جدید حساب Matrix را وارد کنید.", 400);
    }

    const id = req.params.id;
    if (reconnectingServers.has(id)) throw new HandleERROR("ورود مجدد برای این سرور در حال انجام است.", 409);
    reconnectingServers.add(id);
    try {
        const server = await MatrixServer.findById(id);
        if (!server) throw new HandleERROR("سرور ماتریکس پیدا نشد.", 404);
        const serverUrl = requireMatrixServerUrl(server.serverUrl);

        // Matrix permits reusing local encryption state only after a soft logout.
        let reusableDevice;
        if (server.deviceId) {
            try {
                await createTempMatrixClient(server).whoami();
            } catch (error) {
                if (error.errcode === "M_UNKNOWN_TOKEN" && error.data?.soft_logout === true) {
                    reusableDevice = server.deviceId;
                }
            }
        }

        let login;
        try {
            login = await requestMatrixToken(serverUrl, server.userId, password, reusableDevice);
        } catch (error) {
            if (error.matrixStatus === 429) {
                throw new HandleERROR("Matrix تعداد تلاش‌های ورود را محدود کرده است. کمی بعد دوباره تلاش کنید.", 429);
            }
            if (error.matrixStatus >= 400 && error.matrixStatus < 500) {
                throw new HandleERROR("Matrix ورود را نپذیرفت. رمز جدید و فعال بودن ورود با رمز عبور را بررسی کنید.", 400);
            }
            throw new HandleERROR("ورود مجدد به Matrix انجام نشد. اتصال به سرور را بررسی کنید.", 424);
        }

        const newSession = { serverUrl, accessToken: login.access_token };
        if (!matchesSavedAccount(server.userId, login.user_id) || typeof login.device_id !== "string" ||
            !login.device_id || (reusableDevice && login.device_id !== reusableDevice)) {
            if (login.access_token !== server.accessToken) await createTempMatrixClient(newSession).logout().catch(() => {});
            throw new HandleERROR("Matrix نشست سازگار با حساب و دستگاه ذخیره‌شده برنگرداند.", 409);
        }

        const updated = await MatrixServer.updateOne(savedCredentials(server), {
            $set: { accessToken: login.access_token, deviceId: login.device_id },
        });
        if (!updated.matchedCount) {
            if (login.access_token !== server.accessToken) await createTempMatrixClient(newSession).logout().catch(() => {});
            throw new HandleERROR("تنظیمات این سرور هم‌زمان تغییر کرده است. دوباره وضعیت را بررسی کنید.", 409);
        }

        if (!reusableDevice && login.access_token !== server.accessToken) {
            getMatrixBotService().retireUnusedConnection(server).catch(() => {});
        }
        return res.set("Cache-Control", "no-store").json({
            success: true,
            sameDevice: Boolean(reusableDevice),
        });
    } finally {
        reconnectingServers.delete(id);
    }
};

export const remove = async (req, res, next) => {
    const { id } = req.params;
    const server = await MatrixServer.findById(id);
    if (!server) {
        return next(new HandleERROR("Matrix server not found", 404));
    }

    await server.deleteOne();

    return res.status(200).json({
        success: true,
        message: "Matrix server deleted successfully",
    });
};

export const loginWithPassword = async (req, res, next) => {
    const { serverUrl: address, userId, password } = req.body || {};

    if (!address || !userId || !password) {
        return next(new HandleERROR("آدرس سرور ماتریکس، شناسه کاربری و رمز عبور الزامی است", 400));
    }

    const serverUrl = requireMatrixServerUrl(address);

    try {
        const data = await requestMatrixToken(serverUrl, userId, password);
        return res.status(200).json({
            success: true,
            message: "توکن دسترسی ماتریکس با موفقیت از سرور دریافت شد",
            serverUrl,
            accessToken: data.access_token,
            userId: data.user_id,
            deviceId: data.device_id,
            homeServer: data.home_server,
        });
    } catch (err) {
        return next(new HandleERROR(`ورود به سرور ماتریکس ناموفق بود: ${err.message}`, 400));
    }
};

export const testConnection = async (req, res, next) => {
    const { serverUrl: address, password } = req.body || {};
    let { userId, accessToken } = req.body || {};

    if (!address || (!accessToken && !password)) {
        return next(new HandleERROR("آدرس سرور و توکن دسترسی (یا رمز عبور) الزامی است", 400));
    }
    const serverUrl = requireMatrixServerUrl(address);

    // If password provided and token is missing, fetch accessToken via login
    if (!accessToken && password) {
        if (!userId) {
            return next(new HandleERROR("برای ورود با رمز عبور، شناسهٔ کاربری ماتریکس را وارد کنید.", 400));
        }
        try {
            const loginData = await requestMatrixToken(serverUrl, userId, password);
            accessToken = loginData.access_token;
            if (loginData.user_id) userId = loginData.user_id;
        } catch (authErr) {
            return res.status(400).json({
                success: false,
                message: `خطا در ارتباط با سرور ماتریکس: ${authErr.message}`,
            });
        }
    }

    try {
        const client = createTempMatrixClient({ serverUrl, accessToken, userId });

        let profile = null;
        if (userId) {
            try {
                profile = await client.getProfileInfo(userId);
            } catch (pErr) {}
        }

        const { joinedRoomIds, rooms } = await fetchRoomsForClient(client);

        return res.status(200).json({
            success: true,
            message: "Matrix connection successful",
            serverUrl,
            accessToken,
            profile,
            joinedRooms: joinedRoomIds,
            rooms,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: `Matrix connection failed: ${err.message}`,
        });
    }
};

export const getRooms = async (req, res, next) => {
    const { id } = req.params;
    const server = await MatrixServer.findById(id);
    if (!server) {
        return next(new HandleERROR("Matrix server not found", 404));
    }

    try {
        const client = createTempMatrixClient({
            serverUrl: server.serverUrl,
            accessToken: server.accessToken,
            userId: server.userId,
        });

        const { joinedRoomIds, rooms } = await fetchRoomsForClient(client);

        return res.status(200).json({
            success: true,
            joinedRooms: joinedRoomIds,
            rooms,
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            message: `Failed to fetch rooms: ${err.message}`,
        });
    }
};
