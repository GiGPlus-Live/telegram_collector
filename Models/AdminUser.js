import mongoose from "mongoose";
import { getCollectorDatabase } from "../Utils/databaseConfig.js";

const AdminUserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        passwordHash: {
            type: String,
            required: true
        },
        passwordSalt: {
            type: String,
            required: true
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false
        },
        twoFactorSecret: {
            type: String,
            default: ""
        },
        tempTwoFactorSecret: {
            type: String,
            default: ""
        },
        role: {
            type: String,
            default: "admin"
        },
        lastLogin: {
            type: Date
        }
    },
    { timestamps: true }
);

export default getCollectorDatabase("auth").model("AdminUser", AdminUserSchema);
