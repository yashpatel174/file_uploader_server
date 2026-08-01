import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { errorHandler } from "../utils/responseHandler";
import type { Request, Response, NextFunction } from "express";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 10;

const dirCreationCache = new Map<string, Promise<void>>();

const sanitizeFileName = (fileName: string) => {
  const { name, ext } = path.parse(fileName);

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

  return path.join(UPLOAD_ROOT, year, month, day);
};

const ensureDirExists = (dirPath: string) => {
  const existingPromise = dirCreationCache.get(dirPath);
  if (existingPromise) return existingPromise;

  const creationPromise = fs.promises
    .mkdir(dirPath, { recursive: true })
    .then(() => undefined)
    .finally(() => dirCreationCache.delete(dirPath));

  dirCreationCache.set(dirPath, creationPromise);
  return creationPromise;
};

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadDir = getUploadDir();

    try {
      await ensureDirExists(uploadDir);
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `${uniqueSuffix}-${sanitizeFileName(file.originalname)}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES,
    fields: 10,
  },
});

export const uploadMultipleFiles = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  upload.array("files", MAX_FILES)(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      switch (err.code) {
        case "LIMIT_FILE_COUNT":
          return errorHandler(res, `Maximum ${MAX_FILES} files are allowed.`);

        case "LIMIT_UNEXPECTED_FILE":
          return errorHandler(res, "Unexpected file field.");

        default:
          return errorHandler(res, err.message);
      }
    }

    return next(err);
  });
};
