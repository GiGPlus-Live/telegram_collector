import { Router } from "express";
import { getOne, testProxyConnection, update } from "../Controllers/SettingCn.js";

const settingRouter = Router();

settingRouter.route("/")
    .get(getOne)
    .patch(update)
    .put(update);

settingRouter.post("/test-proxy", testProxyConnection);

export default settingRouter;
