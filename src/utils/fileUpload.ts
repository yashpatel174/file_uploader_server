import fs from "fs";
import { parseFile } from "music-metadata";
import path from "path";
import { ENV } from "../config/env";
import { FileModel } from "../models/file.model";
import { IConnector, UserModel } from "../models/user.model";
import { uploadFileToCloud } from "../services/cloud-upload.service";
import { deleteFromDropbox, dropbox_platform } from "../services/dropbox";
import { deleteFromFTP } from "../services/ftp";
import { deleteFromGoogleDrive, google_drive } from "../services/google";
import { deleteFromSFTP } from "../services/sftp";
import { UploadResult } from "../types/upload";
import { sendQuotaNotification } from "./quotation";
import { buildStorageKey } from "./storageKey";
import { unitComparison } from "./unitComparison";

export type IPlatform = "dropbox" | "drive" | "ftp" | "sftp";

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

export const removeUploadedFile = async (filePath: string) => {
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

export interface UploadSource {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export const uploadFileService = async ({
  user,
  userId,
  uploadSource,
  unit,
  platform,
  storageKey,
}: {
  user: any;
  userId: string;
  uploadSource: UploadSource;
  unit: "size" | "time";
  platform: IPlatform;
  storageKey?: string;
}) => {
  if (!allowedMimeTypes.has(uploadSource.mimetype)) {
    throw new Error("Unsupported audio format");
  }

  const { durationInSeconds } = await getAudioDuration(uploadSource.path);
  const fileSizeBytes = uploadSource.size;

  const consumedField = unit === "time" ? "$consumedTime" : "$consumeSizeBytes";
  const totalField = unit === "time" ? "$totalTime" : "$totalSizeBytes";
  const incrementValue = unit === "time" ? durationInSeconds : fileSizeBytes;
  const percentField =
    unit === "time" ? "consumedTimePercent" : "consumedSizePercent";

  const beforeUser = await UserModel.findById(userId)
    .select(percentField)
    .lean();

  const updatePipeline = [
    {
      $set: {
        [consumedField.slice(1)]: {
          $add: [consumedField, incrementValue],
        },

        [percentField]: {
          $round: [
            {
              $cond: [
                { $gt: [totalField, 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $add: [consumedField, incrementValue],
                        },
                        totalField,
                      ],
                    },
                    100,
                  ],
                },
                0,
              ],
            },
            2,
          ],
        },
        connector: platform,
        unit,
      },
    },
  ];

  const userData = await UserModel.findOneAndUpdate(
    {
      _id: userId,
      $expr: {
        $gte: [
          {
            $subtract: [totalField, consumedField],
          },
          incrementValue,
        ],
      },
    },
    updatePipeline,
    {
      returnDocument: "after",
      updatePipeline: true,
    },
  );
  if (!userData) {
    throw new Error(`Your allocated ${unit} quota has been exceeded`);
  }

  const beforePercent =
    unit === "time"
      ? (beforeUser?.consumedTimePercent ?? 0)
      : (beforeUser?.consumedSizePercent ?? 0);

  const toMail = unitComparison(beforePercent, userData[percentField]);

  const inc =
    unit === "time"
      ? {
          consumedTime: -durationInSeconds,
        }
      : {
          consumeSizeBytes: -fileSizeBytes,
        };

  let remoteFileId: string | null = null;
  let remotePath: string | null = null;

  const modifiedFileName =
    storageKey ?? buildStorageKey(user.userName, uploadSource.originalname);

  try {
    let data: UploadResult;
    switch (platform) {
      case "drive":
        data = await google_drive(user, uploadSource, modifiedFileName);
        break;
      case "dropbox":
        data = await dropbox_platform(user, uploadSource, modifiedFileName);
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
          uploadSource.path,
          `/Audio/${modifiedFileName}`,
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
    const { fileName } = fileData;
    remoteFileId = fileData.remoteFileId;
    remotePath = fileData.remotePath;
    // STEP 2: Save file metadata
    const savedFile = await FileModel.create({
      userId,
      fileName,
      platform,
      localFilePath: uploadSource.path,
      mimeType: uploadSource.mimetype,
      status: "uploaded",
      remoteFileId: fileData.remoteFileId,
      remotePath: fileData.remotePath,
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

    if (toMail.isMail && toMail.value) {
      await sendQuotaNotification({
        email: user.email,
        userName: user.userName,
        threshold: toMail.value,
        unit,
      }).catch((error) => {
        console.log("Quota email failed: ", (error as Error).message);
        throw new Error("Quota email failed");
      });
    }
    return {
      message,
      uploadedFileId: savedFile._id,
      remoteFileId,
      remotePath,
      status: "uploaded",
    };
  } catch (err) {
    // STEP 3: rollback DB if metadata fails
    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: inc,
      },
    );

    if (remoteFileId && remotePath) {
      try {
        switch (platform) {
          case "drive":
            await deleteFromGoogleDrive(
              remoteFileId,
              user.googleClientId,
              user.googleClientSecret,
              user.googleAccessToken,
            );
            break;

          case "dropbox":
            await deleteFromDropbox(remoteFileId, user.dropboxAccessToken);
            break;

          case "ftp":
            await deleteFromFTP(remotePath);
            break;

          case "sftp":
            await deleteFromSFTP(remotePath);
            break;
        }
      } catch (cleanupError) {
        console.error("Cloud cleanup failed:", (cleanupError as Error).message);
      }
    }
    throw err;
  } finally {
    if (!storageKey) {
      try {
        await removeUploadedFile(uploadSource.path);
      } catch (error) {
        console.error("Temp file cleanup failed:", (error as Error).message);
      }
    }
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

export const metaDataValidation = async ({
  uploadSource,
}: {
  uploadSource: Express.Multer.File[];
}) => {
  const metadata = await Promise.all(
    uploadSource.map(async (file) => {
      if (!allowedMimeTypes.has(file.mimetype)) {
        throw new Error(`${file.originalname} is not a supported audio format`);
      }

      const { durationInSeconds } = await getAudioDuration(file.path);

      return {
        file,
        durationInSeconds,
        fileSizeBytes: file.size,
        storageKey: buildStorageKey(
          path.parse(file.originalname).name,
          file.originalname,
        ),
      };
    }),
  );

  return {
    metadata,
  };
};
