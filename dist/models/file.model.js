"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileModel = void 0;
const mongoose_1 = require("mongoose");
const fileSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    fileName: {
        type: String,
        required: true,
    },
    sizeBytes: {
        type: Number,
        required: true,
    },
    path: {
        type: String,
        required: true,
    },
}, { timestamps: true });
// Index for user file lookup
fileSchema.index({ userId: 1, createdAt: -1 });
exports.FileModel = (0, mongoose_1.model)("File", fileSchema);
