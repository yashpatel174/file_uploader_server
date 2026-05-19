"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertBytes = exports.uploadFileService = void 0;
const user_model_1 = require("../models/user.model");
const file_model_1 = require("../models/file.model");
const fs_1 = __importDefault(require("fs"));
const uploadFileService = (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, file, }) {
    const fileSizeBytes = file.size;
    // STEP 1: Atomic reservation
    const user = yield user_model_1.UserModel.findOneAndUpdate({
        _id: userId,
        $expr: {
            $gte: [
                { $subtract: ["$totalSizeBytes", "$consumeSizeBytes"] },
                fileSizeBytes,
            ],
        },
    }, {
        $inc: { consumeSizeBytes: fileSizeBytes },
    }, { new: true });
    if (!user) {
        fs_1.default.unlinkSync(file.path);
        throw new Error("Storage limit exceeded");
    }
    try {
        // STEP 2: Save file metadata
        const savedFile = yield file_model_1.FileModel.create({
            userId,
            fileName: file.originalname,
            sizeBytes: fileSizeBytes,
            path: file.path,
        });
        return savedFile;
    }
    catch (err) {
        // STEP 3: rollback DB if metadata fails
        yield user_model_1.UserModel.updateOne({ _id: userId }, { $inc: { consumedSizeKB: -fileSizeBytes } });
        fs_1.default.unlinkSync(file.path);
        throw err;
    }
});
exports.uploadFileService = uploadFileService;
const convertBytes = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
        throw new Error("Bytes cannot be negative and should be integer only");
    }
    return {
        bytes: `${bytes} Bytes`,
        kb: `${(bytes / 1024).toFixed(2)} KB`,
        mb: `${(bytes / 1024 ** 2).toFixed(2)} MB`,
        gb: `${(bytes / 1024 ** 3).toFixed(2)} GB`,
    };
};
exports.convertBytes = convertBytes;
