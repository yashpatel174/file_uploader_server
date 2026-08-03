import { Client } from "basic-ftp";
import { Request, Response } from "express";
import SftpClient from "ssh2-sftp-client";
import { PassThrough } from "stream";
import { getValidGoogleAccessToken } from "../config/auth/google";
import { ENV } from "../config/env";
import { FileModel } from "../models/file.model";
import { Platform, PLATFORMS, UploadJobModel } from "../models/uploadJob.model";
import { UserModel } from "../models/user.model";
import { publishUploadJob } from "../queues/producer";
import { dropboxAccess, refreshDropboxToken } from "../services/dropbox";
import { getDriveAccess } from "../services/google";
import { uploadFilesService } from "../services/upload-file.service";
import {
  createFileModel,
  createUploadJobService,
  getFailedUploadsService,
  retryUploadService,
} from "../services/upload-job.service";
import { handleUploadFailure } from "../services/uploadFailure.service";
import { IPlatform, metaDataValidation } from "../utils/fileUpload";
import { errorHandler, successHandler } from "../utils/responseHandler";
import { buildStorageKey } from "../utils/storageKey";

export const uploadFileController = async (req: Request, res: Response) => {
  try {
    const { _id, unit, platform } = req.body;
    const file = req.file;

    if (!_id) return errorHandler(res, "User ID is required");
    if (!unit) return errorHandler(res, "File Unit is required");
    if (!file) return errorHandler(res, "File is required");
    if (!platform) return errorHandler(res, "File upload location is required");

    let dbPopulation =
      "role email userName consumedTimePercent consumedSizePercent unit";
    if (platform === "drive") {
      dbPopulation +=
        "googleClientId googleClientSecret googleAccessToken role email userName";
    } else if (platform === "dropbox") {
      dbPopulation = "dropboxAccessToken role email userName";
    }

    const user = await UserModel.findById(_id).select(dbPopulation).lean();
    if (!user) return errorHandler(res, "User not found");

    if (user.role !== "user") {
      return errorHandler(res, "Only user have access to upload files.");
    }

    const result = await createUploadJobService({
      user,
      userId: _id,
      uploadSource: file,
      unit,
      platform,
    });

    return successHandler(res, result.message, result);
  } catch (e: any) {
    return errorHandler(res, e.error as string);
  }
};

export const getFailedUploadsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    const result = await getFailedUploadsService({
      page,
      limit,
    });

    return successHandler(res, "Failed uploads fetched successfully.", result);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const retryUploadController = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return errorHandler(res, "Job ID is required");
    }

    const file = await UploadJobModel.findOne(
      { jobId },
      { platform: 1, userId: 1, _id: 0 },
    );
    if (!file) return errorHandler(res, "File not found");

    let populate: string;

    if (file.platform === "drive") {
      populate =
        "googleClientId googleClientSecret googleRefreshTokenEnc googleAccessTokenExpiry";
    } else if (file.platform === "dropbox") {
      populate = "dropboxRefreshToken dropboxAppKey dropboxSecretKey";
    }

    const user = await UserModel.findById(file.userId)
      .select(populate!)
      .lean()
      .exec();
    if (!user) return errorHandler(res, "User not found");

    if (file.platform === "dropbox") {
      const { dropboxRefreshToken, dropboxAppKey, dropboxSecretKey } = user;
      const accessToken: string = await refreshDropboxToken(
        dropboxRefreshToken,
        dropboxAppKey!,
        dropboxSecretKey!,
      );
      const updatedToken = await UserModel.findByIdAndUpdate(file.userId, {
        dropboxAccessToken: accessToken!,
      });
      if (!updatedToken) {
        return errorHandler(res, "Error while updating access token");
      }
    } else if (file.platform === "drive") {
      const {
        googleClientId,
        googleClientSecret,
        googleRefreshTokenEnc,
        googleAccessTokenExpiry,
      } = user;
      const tokenData = await getValidGoogleAccessToken(
        googleClientId,
        googleClientSecret,
        googleRefreshTokenEnc,
        googleAccessTokenExpiry,
      );
      const updatedToken = await UserModel.findByIdAndUpdate(file.userId, {
        googleAccessToken: tokenData.accessToken,
        googleAccessTokenExpiry: tokenData.expiryDate
          ? new Date(tokenData.expiryDate)
          : new Date(Date.now() + 3500 * 1000),
      });
      if (!updatedToken) {
        return errorHandler(res, "Error while updating access token");
      }
    }

    const result = await retryUploadService(jobId as string);

    return successHandler(res, result.message, result);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const getUploadFilesController = async (req: Request, res: Response) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const { userId, platform, search, startDate, endDate } = req.query;

    const result = await uploadFilesService({
      page,
      limit,
      userId: userId as string | undefined,
      platform: platform as IPlatform | undefined,
      search: search as string | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
    });

    return successHandler(res, "Uploaded files fetched successfully.", result);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const getAudioFromPlatforms = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { _id, platform } = req.params;
    if (!_id) return errorHandler(res, "userId is required");
    if (!platform) return errorHandler(res, "Platform is required");

    if (!PLATFORMS.includes(platform as Platform)) {
      return errorHandler(res, "Invalid platform");
    }

    type IPlatform = "sftp" | "ftp" | "dropbox" | "drive";

    const user = await UserModel.findById(_id);
    if (!user) return errorHandler(res, "User not found");

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const [files, failedFiles] = await Promise.all([
      FileModel.find(
        { userId: _id, platform: platform as IPlatform },
        {
          _id: 1,
          fileName: 1,
          platform: 1,
          createdAt: 1,
        },
      )
        .sort({ createdAt: -1 })
        .lean(),

      UploadJobModel.find(
        { userId: _id, platform: platform as IPlatform },
        {
          _id: 1,
          storageKey: 1,
          platform: 1,
          createdAt: 1,
          "lastError.message": 1,
        },
      )
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const result = [
      ...files.map((file) => ({
        id: file._id,
        fileName: file.fileName,
        audioUrl: `${baseUrl}/api/files/${file._id}/stream`,
        success: true,
        createdAt: file.createdAt,
      })),

      ...failedFiles.map((file) => ({
        id: file._id,
        fileName: file.storageKey,
        audioUrl: `${baseUrl}/api/files/${file._id}/stream`,
        success: false,
        lastError: file!.lastError!.message,
        createdAt: file.createdAt,
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const response = result.map(({ createdAt, ...item }) => item);
    return successHandler(res, "Audio received successfully", response);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const getAllAudio = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { _id } = req.params;
    if (!_id) return errorHandler(res, "userId is required");

    const user = await UserModel.findById(_id);
    if (!user) return errorHandler(res, "User not found");

    const files = await FileModel.find(
      { userId: _id },
      { fileName: 1, platform: 1, sizeBytes: 1, createdAt: 1 },
    )
      .sort({ createdAt: -1 })
      .lean();

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const response = files.map((f: any) => ({
      id: f._id,
      fileName: f.fileName,
      platform: f.platform,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt,
      audioUrl: `${baseUrl}/api/files/${f._id}/stream`,
    }));
    return successHandler(res, "Audio received successfully", response);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const getAudioAccess = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!fileId) return errorHandler(res, "File ID is required");

    const getFile = await FileModel.findById(fileId, {
      platform: 1,
      remoteFileId: 1,
      userId: 1,
      remotePath: 1,
    }).populate(
      "userId",
      "googleAccessToken googleAccessTokenExpiry googleRefreshTokenEnc googleClientId googleClientSecret dropboxRefreshToken dropboxSecretKey dropboxAppKey",
    );
    if (!getFile) return errorHandler(res, "File not found");

    const {
      userId: { dropboxRefreshToken, dropboxSecretKey, dropboxAppKey },
    }: any = getFile;

    const { userId, platform, remoteFileId, remotePath } = getFile as any;
    const {
      googleAccessToken,
      googleAccessTokenExpiry,
      googleRefreshTokenEnc,
      googleClientId,
      googleClientSecret,
    } = userId;

    if (platform === "drive") {
      const tokenData = await getValidGoogleAccessToken(
        googleClientId,
        googleClientSecret,
        googleRefreshTokenEnc,
        googleAccessTokenExpiry,
      );

      await getDriveAccess(
        googleClientId,
        googleClientSecret,
        tokenData ? tokenData.accessToken! : googleAccessToken,
        remoteFileId,
        res as Response,
        "read",
      );
    }

    if (platform === "dropbox") {
      const accessToken = await refreshDropboxToken(
        dropboxRefreshToken,
        dropboxAppKey!,
        dropboxSecretKey!,
      );
      await dropboxAccess(accessToken, remoteFileId, res as Response);
    }

    if (platform === "ftp") {
      const client = new Client();

      await client.access({
        host: ENV.sftp_host,
        port: ENV.ftp_port,
        user: ENV.sftp_username,
        password: ENV.sftp_password,
      });

      const stream = new PassThrough();
      stream.pipe(res);
      await client.downloadTo(stream, remotePath);
      client.close();
    }

    if (platform === "sftp") {
      const client = new SftpClient();
      await client.connect({
        host: ENV.sftp_host,
        port: ENV.sftp_port,
        username: ENV.sftp_username,
        password: ENV.sftp_password,
      });

      const file = await client.get(remotePath);

      if (Buffer.isBuffer(file)) res.send(file);
      await client.end();
    }
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const multipleFileUpload = async (req: Request, res: Response) => {
  try {
    const { _id } = req.params;
    const { connector, unit } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      errorHandler(res, "Files are required");
    }

    if (!_id) return errorHandler(res, "UserId is required");
    if (!unit) return errorHandler(res, "File Unit is required");
    if (!connector) return errorHandler(res, "Connector is required");

    const user = await UserModel.findById(_id, {
      userName: 1,
      email: 1,
      dropboxAccessToken: 1,
      googleClientId: 1,
      googleClientSecret: 1,
      googleAccessToken: 1,
      unit: 1,
    })
      .lean()
      .exec();
    if (!user) return errorHandler(res, "User not found");

    const metadata = await metaDataValidation({
      uploadSource: files as Express.Multer.File[],
    });

    const failedUploads: {
      fileName: string;
      error: string;
    }[] = [];

    for (const item of metadata.metadata) {
      const fileName = buildStorageKey(user.userName, item.file.originalname);
      try {
        const job = await createFileModel({
          fileName,
          userId: String(_id),
          platform: connector,
          durationInSeconds: item.durationInSeconds,
          fileSizeBytes: item.fileSizeBytes,
          file: item.file,
          unit,
        });
        if (!job) return errorHandler(res, "File is not stored in database");
        await publishUploadJob(job._id);

        await FileModel.updateOne(
          {
            _id: job._id,
          },
          {
            $set: {
              publishStatus: "published",
            },
          },
        );
      } catch (error) {
        const errorData = await handleUploadFailure({
          error,
          user,
          userId: String(_id),
          uploadSource: item.file,
          unit,
          platform: connector,
          storageKey: fileName,
        });

        failedUploads.push({
          fileName: item.file.originalname,
          error: errorData.error as string,
        });

        continue;
      }
    }

    if (failedUploads.length > 0) {
      return errorHandler(
        res,
        failedUploads[failedUploads.length - 1]?.error ??
          "Some files failed to upload.",
      );
    }

    return successHandler(
      res,
      "Files are cueued successfully",
      metadata.metadata,
    );
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};
