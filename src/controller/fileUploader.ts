import { Client } from "basic-ftp";
import bcrypt from "bcrypt";
import { Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import SftpClient from "ssh2-sftp-client";
import { PassThrough } from "stream";
import { getValidGoogleAccessToken } from "../config/auth/google";
import { ENV } from "../config/env";
import { privateKey, publicKey } from "../config/keys/auth_config";
import { AuthRequest } from "../middleware/authMiddleware";
import { FileModel } from "../models/file.model";
import { TokenModel } from "../models/token.model";
import { Platform, PLATFORMS, UploadJobModel } from "../models/uploadJob.model";
import { UserModel } from "../models/user.model";
import { deleteFileByPlatform, DeleteFilePayload } from "../services/common";
import { dropboxAccess, refreshDropboxToken } from "../services/dropbox";
import { getDriveAccess } from "../services/google";
import { uploadFilesService } from "../services/upload-file.service";
import {
  createUploadJobService,
  getFailedUploadsService,
  retryUploadService,
} from "../services/upload-job.service";
import { IPlatform } from "../utils/fileUpload";
import {
  errorHandler,
  isValidStorageSize,
  successHandler,
} from "../utils/responseHandler";
import { hashToken } from "../utils/token";
import { ClientSession } from "mongoose";
import { emailPrompt } from "../utils/quotation";
import { sendMail } from "../config/nodeMailer";

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const admin = await UserModel.findOne({ role: "admin" });
    if (admin) return errorHandler(res, "Admin already exists");

    const hashedPassword = await bcrypt.hash("Admin@123", 12);

    const newAdmin = new UserModel({
      email: "admin@gmail.com",
      userName: "admin_123",
      password: hashedPassword,
      role: "admin",
      unit: "time",
      totalSizeBytes: 0,
      consumedTimePercent: 0,
      consumedSizePercent: 0,
    });
    await newAdmin.save();

    return successHandler(res, "Admin created successfully");
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { userName, password } = req.body;
    if (!userName) return errorHandler(res, "Username is required");
    if (!password) return errorHandler(res, "Password is required");

    const user = await UserModel.findOne(
      { userName, role: "admin" },
      { password: 1, role: 1 },
    );
    if (!user) return errorHandler(res, "User not found");

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return errorHandler(res, "Password is incorrect");

    const accessToken = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        type: "access",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "1h",
      },
    );

    if (!accessToken) {
      return errorHandler(res, "Error while generating accessToken");
    }

    const refreshToken = jwt.sign(
      {
        sub: user._id.toString(),
        type: "refresh",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "7d",
      },
    );

    if (!refreshToken) {
      return errorHandler(res, "Error while generating refreshToken");
    }

    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newToken = new TokenModel({
      userId: user._id,
      refreshToken: tokenHash,
      expiresAt,
    });
    if (!newToken) return errorHandler(res, "Error while storing tokens");
    await newToken.save();

    const activeuser = await UserModel.findByIdAndUpdate(user._id, {
      isActive: true,
    });

    if (!activeuser) return errorHandler(res, "Error while logging in");
    return successHandler(res, "Logged in successfully!", {
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return errorHandler(res, "Refresh token is required");

    const { type, sub } = jwt.verify(refreshToken, publicKey, {
      algorithms: ["RS256"],
    }) as JwtPayload;
    if (!sub) return errorHandler(res, "Invalid token");

    if (type !== "refresh") {
      return errorHandler(res, "Invalid refresh token");
    }

    const tokenHash = hashToken(refreshToken);
    const tokenDoc = await TokenModel.findOne(
      {
        refreshToken: tokenHash,
      },
      { refreshToken: 1 },
    )
      .select("-_id")
      .lean();
    if (!tokenDoc) return errorHandler(res, "Refresh token not found");

    const user = await UserModel.findById(sub, { role: 1 }).lean();
    if (!user) throw new Error("User not found");

    const newAccessToken = jwt.sign(
      {
        sub,
        role: user.role,
        type: "access",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "1h",
      },
    );

    return successHandler(res, "Access token refreshed", {
      accessToken: newAccessToken,
    });
  } catch (error) {
    return errorHandler(res, "Refresh token expired");
  }
};

export const userLogout = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return errorHandler(res, "User Id is required");
    }

    await Promise.all([
      TokenModel.deleteMany({ userId }),
      UserModel.updateOne(
        { _id: userId },
        {
          $set: {
            isActive: false,
          },
        },
      ),
    ]);

    return successHandler(res, "User logged out successfully");
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { userName, email, totalSizeBytes, unit, totalTime } = req.body;
    if (!userName) return errorHandler(res, "Username is required");
    if (!email) return errorHandler(res, "Email is required");
    if (!unit) return errorHandler(res, "Unit is required");

    // const existingUser = await UserModel.findOne({ userName, role: "user" });
    const existingUser = await UserModel.findOne({
      $or: [{ userName }, { email }],
      role: "user",
    }).select("email userName");

    if (existingUser) {
      if (existingUser.userName === userName && existingUser.email === email) {
        return errorHandler(res, "Username and email already exist");
      }

      if (existingUser.userName === userName) {
        return errorHandler(res, "Username already exists");
      }

      if (existingUser.email === email) {
        return errorHandler(res, "Email already exists");
      }
    }

    let newUser: any = "";

    if (unit === "size") {
      if (!isValidStorageSize(totalSizeBytes)) {
        return errorHandler(res, "Total Size must be a non-negative number");
      }

      newUser = new UserModel({
        userName,
        role: "user",
        totalSizeBytes,
        unit,
        email,
        consumedTimePercent: 0,
        consumedSizePercent: 0,
      });
    } else if (unit === "time") {
      if (!isValidStorageSize(totalTime)) {
        return errorHandler(res, "Total Time must be a non-negative number");
      }

      newUser = new UserModel({
        userName,
        role: "user",
        totalTime,
        unit,
        email,
        consumedTimePercent: 0,
        consumedSizePercent: 0,
      });
    }
    await newUser.save();

    return successHandler(res, "User created successfully", {
      userName: newUser.userName,
      role: newUser.role,
      unit: newUser.unit,
    });
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const uploadFileController = async (req: Request, res: Response) => {
  try {
    const { _id, unit, platform } = req.body;
    const file = req.file;

    if (!_id) return errorHandler(res, "User ID is required");
    if (!unit) return errorHandler(res, "File Unit is required");
    if (!file) return errorHandler(res, "File is required");
    if (!platform) return errorHandler(res, "File upload location is required");

    let dbPopulation =
      "role email userName consumedTimePercent consumedSizePercent";
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

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      UserModel.find(
        { role: "user" },
        {
          userName: 1,
          totalSizeBytes: 1,
          consumeSizeBytes: 1,
          totalTime: 1,
          consumedTime: 1,
          unit: 1,
          email: 1,
          consumedTimePercent: 1,
          consumedSizePercent: 1,
          googleAuthenticated: 1,
          dropboxAuthenticated: 1,
        },
      )
        .select("-password")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      UserModel.countDocuments({ role: "user" }),
    ]);

    if (!users || users.length === 0) {
      return errorHandler(res, "Users not found");
    }

    const userIds = users.map((user) => new Types.ObjectId(user._id));
    interface IReports {
      userId: string;
      unit: string;
      actualLimit: number;
      jobId: string;
    }

    const failReports: IReports[] = [];

    for (const user of users ?? []) {
      const reports = await UploadJobModel.find(
        { userId: user._id },
        {
          jobId: 1,
          unit: 1,
          sizeBytes: 1,
          timeDuration: 1,
        },
      ).lean();

      for (const report of reports) {
        failReports.push({
          userId: user._id.toString(),
          unit: report.unit,
          actualLimit:
            report.unit === "size" ? report.sizeBytes : report.timeDuration,
          jobId: report.jobId,
        });
      }
    }

    const fileCounts = await FileModel.aggregate([
      {
        $match: { userId: { $in: userIds } },
      },
      {
        $group: { _id: "$userId", totalDocuments: { $sum: 1 } },
      },
    ]);

    const countMap = new Map<string, number>();
    for (const item of fileCounts) {
      countMap.set(item._id.toString(), item.totalDocuments);
    }

    const dropdown: any = [];

    const transformedUsers = users.map((user) => {
      const totalBytes = user.totalSizeBytes;
      const totalTime = user.totalTime;
      const consumedBytes = user.consumeSizeBytes;
      const consumedTime = user.consumedTime;
      const availableBytes = Math.max(0, totalBytes - consumedBytes);
      const availableTime = Math.max(0, totalTime - consumedTime);

      dropdown.push({
        _id: user._id.toString(),
        userName: user.userName,
        unit: user.unit,
        googleAuthenticated: user.googleAuthenticated,
        dropboxAuthenticated: user.dropboxAuthenticated,
        size: {
          total: totalBytes,
          consumed: consumedBytes,
        },
        time: {
          total: totalTime,
          consumed: consumedTime,
        },
      });

      return {
        _id: user._id.toString(),
        userName: user.userName,
        email: user.email,
        unit: user.unit,
        size: {
          total: totalBytes,
          consumed: consumedBytes,
          available: availableBytes,
        },
        time: {
          total: totalTime,
          consumed: consumedTime,
          available: availableTime,
        },
        totalDocuments: countMap.get(user._id.toString()) ?? 0,
        consumedTimePercent: user.consumedTimePercent,
        consumedSizePercent: user.consumedSizePercent,
      };
    });

    return successHandler(res, "Users fetched successfully", {
      transformedUsers,
      failReports,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      dropdown,
    });
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const updateUserAccess = async (req: Request, res: Response) => {
  try {
    const { _id } = req.params;
    const { unit, newValue, isReset, isMail, jobId, emailPayload } = req.body;
    if (!unit) return errorHandler(res, "Data unit is required");

    if (!isValidStorageSize(newValue)) {
      return errorHandler(res, "Total Size must be a non-negative number");
    }

    const user = await UserModel.findById(_id);
    if (!user) return errorHandler(res, "User not found");
    if (unit === "size" && newValue < user.consumeSizeBytes) {
      return errorHandler(
        res,
        "Total Size cannot be less than the consumed storage",
      );
    }

    const session = await mongoose.startSession();
    let updatedUser;
    try {
      updatedUser = await UserModel.findByIdAndUpdate(
        _id,
        [
          {
            $set:
              unit === "size"
                ? {
                    totalSizeBytes: newValue,
                    unit,
                    consumedSizePercent: {
                      $round: [
                        {
                          $cond: [
                            { $gt: [newValue, 0] },
                            {
                              $multiply: [
                                {
                                  $divide: ["$consumeSizeBytes", newValue],
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
                  }
                : {
                    totalTime: newValue,
                    unit,
                    consumedTimePercent: {
                      $round: [
                        {
                          $cond: [
                            { $gt: [newValue, 0] },
                            {
                              $multiply: [
                                {
                                  $divide: ["$consumedTime", newValue],
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
                  },
          },
        ],
        {
          returnDocument: "after",
          updatePipeline: true,
          runValidators: true,
          session,
        },
      );
      if (!updatedUser) {
        return errorHandler(res, "Error while updating the data.");
      }
      if (jobId && isReset === true) {
        await UploadJobModel.findOneAndUpdate(
          { jobId },
          { status: "failed", attempts: [], attemptCount: 0, retryable: true },
          { session },
        );
      }
    } catch (error) {
      await session.abortTransaction();
    } finally {
      session.endSession();
    }

    if (isMail) {
      const { total, used, updated } = emailPayload;
      if (unit === "size") {
        if (total === "") errorHandler(res, "Total Size is required");
        if (used === "") errorHandler(res, "Utilized Size is required");
        if (updated === "") errorHandler(res, "New Size is required");
      } else if (unit === "time") {
        if (total === "") errorHandler(res, "Total Time is required");
        if (used === "") errorHandler(res, "Utilized Time is required");
        if (updated === "") errorHandler(res, "New Time is required");
      }

      const title =
        unit === "size"
          ? "Storage Limit Has Been Increased"
          : "Audio Duration Limit Has Been Increased";
      const summaryTitle =
        unit === "size" ? "Storage Summary" : "Audio Duration Summary";
      const emailMsg = emailPrompt(
        title,
        summaryTitle,
        total,
        used,
        updated,
      );

      await sendMail({
        to: user.email,
        subject: summaryTitle,
        html: emailMsg,
      });
    }

    return successHandler(res, "User data updated successfully", updatedUser);
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

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { _id } = req.params;
    if (!_id) return errorHandler(res, "User ID is required");

    const files = await FileModel.find(
      { userId: _id },
      {
        platform: 1,
        remoteFileId: 1,
        remotePath: 1,
        _id: 0,
      },
    );

    const selectFields: string[] = [];

    const isDrive = files.some((f) => f.platform === "drive");
    const isDropbox = files.some((f) => f.platform === "dropbox");

    if (isDrive) {
      selectFields.push(
        "+googleClientId",
        "+googleClientSecret",
        "+googleAccessToken",
        "+googleRefreshTokenEnc",
        "+googleAccessTokenExpiry",
      );
    }

    if (isDropbox) {
      selectFields.push(
        "+dropboxAppKey",
        "+dropboxSecretKey",
        "+dropboxRefreshToken",
      );
    }

    const user = await UserModel.findById(_id)
      .select(selectFields.join(" "))
      .lean()
      .exec();
    if (!user) return errorHandler(res, "User not found");

    const {
      googleAccessToken,
      googleAccessTokenExpiry,
      googleRefreshTokenEnc,
      googleClientId,
      googleClientSecret,
      dropboxRefreshToken,
      dropboxSecretKey,
      dropboxAppKey,
    } = user;

    let tokenData: any;
    if (isDrive) {
      tokenData = await getValidGoogleAccessToken(
        googleClientId,
        googleClientSecret,
        googleRefreshTokenEnc,
        googleAccessTokenExpiry,
      );
    }

    const results = await Promise.allSettled(
      files.map((f) => {
        const file = f as DeleteFilePayload;

        return deleteFileByPlatform({
          file,
          clientId: isDrive ? googleClientId! : "",
          clientSecretKey: isDrive ? googleClientSecret! : "",
          accessToken: tokenData ? tokenData.accessToken : googleAccessToken!,
          refreshToken: isDropbox ? dropboxRefreshToken! : "",
          appKey: isDropbox ? dropboxAppKey! : "",
          appSecret: isDropbox ? dropboxSecretKey! : "",
        });
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) {
      console.error(
        "Cloud file deletion failures:",
        failed.map((f) => (f as PromiseRejectedResult).reason),
      );
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      await FileModel.deleteMany({ userId: _id }, { session });
      await UserModel.findByIdAndDelete(_id, { session });
      await UploadJobModel.deleteMany({ userId: _id }, { session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return successHandler(res, "User deleted successfully");
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const authConnection = async (req: Request, res: Response) => {
  try {
    const { platform, _id } = req.params;

    let populate: string;

    if (platform === "drive") {
      populate =
        "googleClientId googleClientSecret googleRefreshTokenEnc googleAccessTokenExpiry";
    } else if (platform === "dropbox") {
      populate = "dropboxRefreshToken dropboxAppKey dropboxSecretKey";
    }

    const user = await UserModel.findById(_id).select(populate!).lean().exec();
    if (!user) return errorHandler(res, "User not found");

    if (platform === "dropbox") {
      const { dropboxRefreshToken, dropboxAppKey, dropboxSecretKey } = user;
      const accessToken: string = await refreshDropboxToken(
        dropboxRefreshToken,
        dropboxAppKey!,
        dropboxSecretKey!,
      );
      const updatedToken = await UserModel.findByIdAndUpdate(_id, {
        dropboxAccessToken: accessToken!,
      });
      if (!updatedToken) {
        return errorHandler(res, "Error while updating access token");
      }
      return successHandler(
        res,
        "Dropbox authenticated successfully",
        platform,
      );
    } else if (platform === "drive") {
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
      const updatedToken = await UserModel.findByIdAndUpdate(_id, {
        googleAccessToken: tokenData.accessToken,
        googleAccessTokenExpiry: tokenData.expiryDate
          ? new Date(tokenData.expiryDate)
          : new Date(Date.now() + 3500 * 1000),
      });
      if (!updatedToken) {
        return errorHandler(res, "Error while updating access token");
      }
      return successHandler(res, "Google authenticated successfully", platform);
    }
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};
