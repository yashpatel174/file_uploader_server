import fs from "fs";
import { parseFile } from "music-metadata";
import path from "path";
import { ENV } from "../config/env";
import { FileModel } from "../models/file.model";
import { UserModel } from "../models/user.model";
import { uploadFileToCloud } from "../services/cloud-upload.service";
import { dropbox_platform } from "../services/dropbox";
import { google_drive } from "../services/google";

type IPlatform = "dropbox" | "drive" | "ftp" | "sftp";

const allowedMimeTypes = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
]);

export interface ConvertedSize {
  bytes: string;
  kb: string;
  mb: string;
  gb: string;
}

export interface IUploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

export interface IAudioMetadata {
  durationInSeconds: number;
  formattedDuration: string;
}

const removeUploadedFile = async (filePath: string) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export const getAudioDuration = async (
  file: string,
): Promise<IAudioMetadata> => {
  const metadata = await parseFile(file);
  const rawDuration = metadata.format.duration;

  if (
    rawDuration === undefined ||
    rawDuration === null ||
    Number.isNaN(rawDuration)
  ) {
    throw new Error("Unable to extract audio duration");
  }

  const totalSeconds = Math.round(rawDuration);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    durationInSeconds: totalSeconds,
    formattedDuration: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
};

export const uploadFileService = async ({
  user,
  userId,
  file,
  unit,
  platform,
}: {
  user: any;
  userId: string;
  file: Express.Multer.File;
  unit: "size" | "time";
  platform: IPlatform;
}) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    throw new Error("Unsupported audio format");
  }

  const { durationInSeconds } = await getAudioDuration(file.path);
  const fileSizeBytes = file.size;

  if (unit === "time") {
    const userTime = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        $expr: {
          $gte: [
            { $subtract: ["$totalTime", "$consumedTime"] },
            durationInSeconds,
          ],
        },
      },
      {
        $inc: {
          consumedTime: durationInSeconds,
        },
        $set: {
          unit,
        },
      },
      { returnDocument: "after" },
    );

    if (!userTime) {
      await removeUploadedFile(file.path);
      throw new Error("Audio duration limit exceeded");
    }
  } else if (unit === "size") {
    // STEP 1: Atomic reservation
    const userFileSize = await UserModel.findOneAndUpdate(
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
        $inc: {
          consumeSizeBytes: fileSizeBytes,
        },
        $set: {
          unit,
        },
      },
      { returnDocument: "after" },
    );

    if (!userFileSize) {
      await removeUploadedFile(file.path);
      throw new Error("Storage limit exceeded");
    }
  }

  const inc =
    unit === "time"
      ? {
          consumedTime: -durationInSeconds,
        }
      : {
          consumeSizeBytes: -fileSizeBytes,
        };

  try {
    let data: any;
    switch (platform) {
      case "drive":
        data = await google_drive(user, file);
        break;
      case "dropbox":
        data = await dropbox_platform(user, file);
        break;
      default:
        let port = 0;
        if (platform === "sftp") {
          port = ENV.sftp_port;
        } else if (platform === "ftp") {
          port = ENV.ftp_port;
        }
        data = await uploadFileToCloud(
          platform,
          file.path,
          `/Audio/${file.originalname}`,
          {
            host: ENV.sftp_host,
            port: port as number,
            username: ENV.sftp_username,
            password: ENV.sftp_password,
          },
        );
        break;
    }
    const { fileData, message } = data;
    const { fileName, remoteFileId, remotePath } = fileData;
    // STEP 2: Save file metadata
    const savedFile = await FileModel.create({
      userId,
      fileName,
      platform,
      remoteFileId,
      remotePath,
      ...(unit === "time"
        ? {
            timeDuration: durationInSeconds,
          }
        : {
            sizeBytes: fileSizeBytes,
          }),
    });
    if (!savedFile) {
      throw new Error("Error while storing file info in database");
    }
    return { message };
  } catch (err) {
    // STEP 3: rollback DB if metadata fails
    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: inc,
      },
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
