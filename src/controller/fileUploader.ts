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
import { UserModel } from "../models/user.model";
import { deleteFileByPlatform, DeleteFilePayload } from "../services/common";
import { dropboxAccess, refreshDropboxToken } from "../services/dropbox";
import { getDriveAccess } from "../services/google";
import { uploadFileService } from "../utils/fileUpload";
import {
  errorHandler,
  isValidStorageSize,
  successHandler,
} from "../utils/responseHandler";

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const admin = await UserModel.findOne({ role: "admin" });
    if (admin) return errorHandler(res, "Admin already exists");

    const hashedPassword = await bcrypt.hash("Admin@123", 12);

    const newAdmin = new UserModel({
      userName: "admin_123",
      password: hashedPassword,
      role: "admin",
      unit: "time",
      totalSizeBytes: 0,
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
      { userName },
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
        expiresIn: "1m",
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

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newToken = new TokenModel({
      userId: user._id,
      refreshToken: refreshTokenHash,
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

    const tokenDoc = await TokenModel.findOne(
      {
        userId: sub,
      },
      { refreshToken: 1 },
    )
      .select("-_id")
      .lean();
    if (!tokenDoc) return errorHandler(res, "Refresh token not found");

    const isMatch = await bcrypt.compare(refreshToken, tokenDoc.refreshToken);
    if (!isMatch) return errorHandler(res, "Refresh token mismatch");

    const user = await UserModel.findById(sub, {
      role: 1,
    });
    if (!user) return errorHandler(res, "User not found");

    const newAccessToken = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        type: "access",
      },
      privateKey,
      {
        algorithm: "RS256",
        expiresIn: "1m",
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
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const userId = req?.user?.id;
    if (!userId) {
      await session.abortTransaction();
      return errorHandler(res, "User Id is required");
    }

    const user = await UserModel.findOne({ _id: userId, isActive: true });
    if (!user) return errorHandler(res, "User not found");

    const token = await TokenModel.find({ userId });
    if (!token || token.length === 0) {
      return errorHandler(res, "User is inactive");
    }

    const deleteResult = await TokenModel.findOneAndDelete(
      { userId },
      { session },
    );
    if (!deleteResult) {
      await session.abortTransaction();
      return errorHandler(res, "Error while deleting token.");
    }

    const inactiveUser = await UserModel.findByIdAndUpdate(
      userId,
      {
        isActive: false,
      },
      { session },
    );
    if (!inactiveUser) {
      await session.abortTransaction();
      return errorHandler(res, "Error while updating user status.");
    }

    await session.commitTransaction();
    return successHandler(res, "User Logged out successfully");
  } catch {
    await session.abortTransaction();
    return errorHandler(res, "Refresh token expired");
  } finally {
    await session.endSession();
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { userName, totalSizeBytes, unit, totalTime } = req.body;
    if (!userName) return errorHandler(res, "Username is required");
    if (!unit) return errorHandler(res, "Unit is required");

    const existingUser = await UserModel.findOne({ userName, role: "user" });
    if (existingUser) return errorHandler(res, "User already exist");

    let newUser: any = "";

    if (unit === "size") {
      if (!isValidStorageSize(totalSizeBytes)) {
        return errorHandler(res, "Total Size must be a non-negative number");
      }

      newUser = new UserModel({ userName, role: "user", totalSizeBytes, unit });
    } else if (unit === "time") {
      if (!isValidStorageSize(totalTime)) {
        return errorHandler(res, "Total Time must be a non-negative number");
      }

      newUser = new UserModel({ userName, role: "user", totalTime, unit });
    }
    await newUser.save();

    return successHandler(res, "User created successfully", newUser);
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

    let dbPopulation = "";
    if (platform === "drive") {
      dbPopulation = "googleClientId googleClientSecret googleAccessToken role";
    } else if (platform === "dropbox") {
      dbPopulation = "dropboxAccessToken role";
    }

    const user = await UserModel.findById(_id).select(dbPopulation).lean();
    if (!user) return errorHandler(res, "User not found");

    if (user.role !== "user") {
      return errorHandler(res, "Only user have access to upload files.");
    }

    const { message } = await uploadFileService({
      user,
      userId: _id,
      file,
      unit,
      platform,
    });

    return successHandler(res, message, user);
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const skip = (page - 1) * limit;

    const [users, total, dropdown] = await Promise.all([
      UserModel.find(
        { role: "user" },
        {
          userName: 1,
          totalSizeBytes: 1,
          consumeSizeBytes: 1,
          totalTime: 1,
          consumedTime: 1,
          unit: 1,
        },
      )
        .select("-password")
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      UserModel.countDocuments({ role: "user" }),
      UserModel.find(
        { role: "user" },
        {
          userName: 1,
          unit: 1,
          googleAuthenticated: 1,
          dropboxAuthenticated: 1,
        },
      ).lean(),
    ]);

    if (!users || users.length === 0) {
      return errorHandler(res, "Users not available.");
    }

    const userIds = users.map((user) => new Types.ObjectId(user._id));

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

    const transformedUsers = users.map((user) => {
      const totalBytes = user.totalSizeBytes;
      const totalTime = user.totalTime;
      const consumedBytes = user.consumeSizeBytes;
      const consumedTime = user.consumedTime;
      const availableBytes = Math.max(0, totalBytes - consumedBytes);
      const availableTime = Math.max(0, totalTime - consumedTime);

      return {
        _id: user._id.toString(),
        userName: user.userName,
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
      };
    });
    return successHandler(res, "Users fetched successfully", {
      transformedUsers,
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
    const { unit, newValue } = req.body;
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

    const updatedUser = await UserModel.findByIdAndUpdate(
      _id,
      {
        $set:
          unit === "size"
            ? { totalSizeBytes: newValue, unit }
            : { totalTime: newValue, unit },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );
    if (!updatedUser) {
      return errorHandler(res, "Error while updating the data.");
    }

    return successHandler(res, "User data updated successfully", updatedUser);
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

    files?.map(async (f) => {
      const file = f as DeleteFilePayload;
      (await deleteFileByPlatform({
        file,
        clientId: isDrive ? (googleClientId as string) : "",
        clientSecretKey: isDrive ? (googleClientSecret as string) : "",
        accessToken: tokenData
          ? tokenData.accessToken!
          : (googleAccessToken as string),
        refreshToken: isDropbox ? (dropboxRefreshToken as string) : "",
        appKey: isDropbox ? (dropboxAppKey as string) : "",
        appSecret: isDropbox ? (dropboxSecretKey as string) : "",
      })) as any;
    });

    if (files.length) {
      const deleteAllFiles = await FileModel.deleteMany({
        userId: user ? user._id : _id,
      });
      if (!deleteAllFiles) {
        return errorHandler(res, "Error while deleting files collection");
      }
    }

    const deleteUser = await UserModel.findByIdAndDelete(_id);
    if (!deleteUser) {
      return errorHandler(res, "Error while deleting files collection");
    }

    return successHandler(res, "User deleted successfully", deleteUser._id);
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
