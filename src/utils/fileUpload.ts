import { UserModel } from "../models/user.model";
import { FileModel } from "../models/file.model";
import fs from "fs";

export interface ConvertedSize {
  bytes: string;
  kb: string;
  mb: string;
  gb: string;
}

const removeUploadedFile = async (filePath: string) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

export const uploadFileService = async ({
  userId,
  file,
}: {
  userId: string;
  file: Express.Multer.File;
}) => {
  const fileSizeBytes = file.size;

  // STEP 1: Atomic reservation
  const user = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $gte: [
          { $subtract: ["$totalSizeBytes", "$consumeSizeBytes"] },
          fileSizeBytes,
        ],
      },
    },
    {
      $inc: { consumeSizeBytes: fileSizeBytes },
    },
    { new: true },
  );

  if (!user) {
    await removeUploadedFile(file.path);
    throw new Error("Storage limit exceeded");
  }

  try {
    // STEP 2: Save file metadata
    const savedFile = await FileModel.create({
      userId,
      fileName: file.originalname,
      sizeBytes: fileSizeBytes,
      path: file.path,
    });

    return savedFile;
  } catch (err) {
    // STEP 3: rollback DB if metadata fails
    await UserModel.updateOne(
      { _id: userId },
      { $inc: { consumeSizeBytes: -fileSizeBytes } },
    );

    await removeUploadedFile(file.path);

    throw err;
  }
};

export const convertBytes = (bytes: number): ConvertedSize => {
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
