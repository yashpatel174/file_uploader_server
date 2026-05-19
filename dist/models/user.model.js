"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    userName: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
    },
    role: {
        type: String,
        enum: ["admin", "user"],
        required: true,
        index: true,
    },
    totalSizeBytes: {
        type: Number,
        required: true,
        min: 0,
    },
    consumeSizeBytes: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
    },
}, {
    timestamps: true,
});
// Compound index for fast lookup
userSchema.index({ userName: 1, role: 1 });
userSchema.index({ _id: 1, totalSizeBytes: 1, consumeSizeBytes: 1 });
exports.UserModel = (0, mongoose_1.model)("User", userSchema);
