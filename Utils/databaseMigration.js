import mongoose from "mongoose";
import { getCollectorDatabase } from "./databaseConfig.js";

import AdminUser from "../Models/AdminUser.js";
import TelegramAccount from "../Models/TelegramAccount.js";
import Channel from "../Models/Channel.js";
import MatrixServer from "../Models/MatrixServer.js";
import MatrixChannel from "../Models/MatrixChannel.js";
import Setting from "../Models/Setting.js";

const sources = [
    [AdminUser],
    [TelegramAccount],
    [Channel],
    [MatrixServer, "matrixservers"],
    [MatrixChannel, "matrixchannels"],
    [Setting],
];

export async function migrateLegacyDatabase() {
    const migrations = getCollectorDatabase("settings").db.collection("migrations");
    const migration = { _id: "split-databases-v1" };
    if (await migrations.findOne(migration)) return;

    for (const [model, ...aliases] of sources) {
        const target = model.db.db.collection(model.collection.name);
        for (const name of new Set([model.collection.name, ...aliases])) {
            const records = mongoose.connection.db.collection(name).find();
            for await (const { _id, ...document } of records) {
                await target.updateOne({ _id }, { $setOnInsert: document }, { upsert: true });
            }
        }
    }
    await migrations.updateOne(migration, { $setOnInsert: { appliedAt: new Date() } }, { upsert: true });
}
