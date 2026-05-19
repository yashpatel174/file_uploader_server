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
exports.upload = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const UPLOAD_ROOT = path_1.default.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const dirCreationCache = new Map();
const sanitizeFileName = (fileName) => {
    const { name, ext } = path_1.default.parse(fileName);
    const safeName = name
        .trim()
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80);
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 16);
    return `${safeName || "file"}${safeExt}`;
};
const getUploadDir = () => {
    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const day = String(now.getUTCDate()).padStart(2, "0");
    return path_1.default.join(UPLOAD_ROOT, year, month, day);
};
const ensureDirExists = (dirPath) => {
    const existingPromise = dirCreationCache.get(dirPath);
    if (existingPromise) {
        return existingPromise;
    }
    const creationPromise = fs_1.default.promises
        .mkdir(dirPath, { recursive: true })
        .then(() => undefined)
        .finally(() => {
        dirCreationCache.delete(dirPath);
    });
    dirCreationCache.set(dirPath, creationPromise);
    return creationPromise;
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => __awaiter(void 0, void 0, void 0, function* () {
        const uploadDir = getUploadDir();
        try {
            yield ensureDirExists(uploadDir);
            cb(null, uploadDir);
        }
        catch (error) {
            cb(error, uploadDir);
        }
    }),
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto_1.default.randomUUID()}`;
        cb(null, `${uniqueSuffix}-${sanitizeFileName(file.originalname)}`);
    },
});
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: 1,
        fields: 10,
    },
});
