import { Router } from "express";
import {
    create,
    getAll,
    getOne,
    getRooms,
    loginWithPassword,
    reconnect,
    remove,
    testConnection,
    testSavedConnection,
    update,
} from "../Controllers/MatrixServerCn.js";
import {
    cancelVerification,
    confirmVerification,
    prepareRecoveryKey,
    prepareRecoveryReset,
    resetRecoveryKey,
    setupRecoveryKey,
    startVerification,
    verificationStatus,
    verifyRecoveryKey,
} from "../Controllers/MatrixVerificationCn.js";

const matrixServerRouter = Router();

// Password login / acquire token
matrixServerRouter.post("/login", loginWithPassword);

// Test connection
matrixServerRouter.post("/test", testConnection);

// Server management
matrixServerRouter.route("/")
    .get(getAll)
    .post(create);

matrixServerRouter.route("/:id")
    .get(getOne)
    .put(update)
    .patch(update)
    .delete(remove);

matrixServerRouter.get("/:id/rooms", getRooms);
matrixServerRouter.get("/:id/connection", testSavedConnection);
matrixServerRouter.post("/:id/reconnect", reconnect);

matrixServerRouter.route("/:id/verification")
    .get(verificationStatus)
    .post(startVerification);
matrixServerRouter.post("/:id/verification/:attemptId/confirm", confirmVerification);
matrixServerRouter.delete("/:id/verification/:attemptId", cancelVerification);
matrixServerRouter.post("/:id/verification/recovery/prepare", prepareRecoveryKey);
matrixServerRouter.post("/:id/verification/recovery/setup", setupRecoveryKey);
matrixServerRouter.post("/:id/verification/recovery/reset/prepare", prepareRecoveryReset);
matrixServerRouter.post("/:id/verification/recovery/reset", resetRecoveryKey);
matrixServerRouter.post("/:id/verification/recovery", verifyRecoveryKey);

export default matrixServerRouter;
