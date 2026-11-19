import {Router} from "express";
import {create, getAll, getOne, remove, update} from "../Controllers/ChannelCn.js";

const channelRouter = Router();

channelRouter.route("/")
    .get(getAll)
    .post(create);

channelRouter.route("/:id")
    .get(getOne)
    .delete(remove)
    .patch(update);

export default channelRouter;