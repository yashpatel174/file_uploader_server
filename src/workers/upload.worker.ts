import fs from "fs/promises";
import { FileModel } from "../models/file.model";
import { UserModel } from "../models/user.model";
import { uploadToFTP } from "../services/ftp";
import { uploadToSFTP } from "../services/sftp";
import { dropbox_platform } from "../services/dropbox";
import { google_drive } from "../services/google";
import { UploadSource } from "../utils/fileUpload";
import { ENV } from "../config/env";

export const processUpload = async ({
  user,
  userId,
  uploadSource,
  platform,
  storageKey,
  durationInSeconds,
  fileSizeBytes,
}: {
  user: any;
  userId: string;
  uploadSource: UploadSource;
  platform: "ftp" | "sftp" | "dropbox" | "drive";
  storageKey: string;
  durationInSeconds: number;
  fileSizeBytes: number;
}) => {
  let uploaded;

  try {
    switch (platform) {
      case "ftp":
        uploaded = await uploadToFTP(
          uploadSource.path,
          `/Audio/${uploadSource.originalname}`,
          {
            host: ENV.sftp_host,
            port: ENV.ftp_port,
            username: ENV.sftp_username,
            password: ENV.sftp_password,
          },
        );
        break;

      case "sftp":
        uploaded = await uploadToSFTP(
          uploadSource.path,
          `/Audio/${uploadSource.originalname}`,
          {
            host: ENV.sftp_host,
            port: ENV.sftp_port,
            username: ENV.sftp_username,
            password: ENV.sftp_password,
          },
        );
        break;

      case "dropbox":
        uploaded = await dropbox_platform(
          user,
          uploadSource,
          uploadSource.originalname,
        );
        break;

      case "drive":
        uploaded = await google_drive(
          user,
          uploadSource,
          uploadSource.originalname,
        );
        break;

      default:
        throw new Error("Unsupported platform");
    }

    const {
      fileData: { fileName, remoteFileId, remotePath },
    } = uploaded;

    await FileModel.updateOne(
      { storageKey },
      {
        fileName,
        remoteFileId,
        remotePath,
        status: "uploaded",
      },
    );

    await fs.unlink(uploadSource.path);

    return uploaded;
  } catch (error) {
    // rollback quota

    if (user.unit === "size") {
      await UserModel.updateOne(
        { _id: userId },
        {
          $inc: {
            consumeSizeBytes: -fileSizeBytes,
          },
        },
      );
    } else {
      await UserModel.updateOne(
        { _id: userId },
        {
          $inc: {
            consumedTime: -durationInSeconds,
          },
        },
      );
    }

    await fs.unlink(uploadSource.path).catch(() => {});

    throw error;
  }
};
