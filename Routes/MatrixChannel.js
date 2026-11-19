import { Router } from "express";
import {
    create,
    getAll,
    getOne,
    remove,
    update,
} from "../Controllers/MatrixChannelCn.js";

const matrixChannelRouter = Router();

matrixChannelRouter.route("/")
    .get(getAll)
    .post(create);

matrixChannelRouter.route("/:id")
    .get(getOne)
    .put(update)
    .patch(update)
    .delete(remove);

export default matrixChannelRouter;
