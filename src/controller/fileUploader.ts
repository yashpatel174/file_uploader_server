import { Request, Response } from "express";
import { UserModel } from "../models/user.model";
import { convertBytes, uploadFileService } from "../utils/fileUpload";
import { errorHandler, successHandler } from "../utils/responseHandler";

const isValidStorageSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const admin = await UserModel.findOne({ role: "admin" });
    if (admin) {
      return errorHandler(res, 400, "Admin already exists");
    }

    const newAdmin = new UserModel({
      userName: "admin_123",
      role: "admin",
      totalSizeBytes: 0,
    });
    await newAdmin.save();

    return successHandler(res, "Admin created successfully", newAdmin);
  } catch (error) {
    return errorHandler(res, 400, (error as Error).message);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { userName, totalSizeBytes } = req.body;
    if (!userName) {
      return errorHandler(res, 400, "username is required");
    }

    if (!isValidStorageSize(totalSizeBytes)) {
      return errorHandler(res, 400, "Total Size must be a non-negative number");
    }

    const existingUser = await UserModel.findOne({ userName, role: "user" });
    if (existingUser) {
      return errorHandler(res, 400, "User already exist");
    }

    const newUser = new UserModel({ userName, role: "user", totalSizeBytes });
    await newUser.save();

    return successHandler(res, "User created successfully", newUser);
  } catch (error) {
    return errorHandler(res, 400, (error as Error).message);
  }
};

export const uploadFileController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const file = req.file;

    if (!userId) {
      return errorHandler(res, 400, "User ID is required");
    }

    const user = await UserModel.findById(userId).lean();
    if (!user) {
      return errorHandler(res, 400, "User not found");
    }
    if (user.role !== "user") {
      return errorHandler(res, 400, "Only user have access to upload files.");
    }

    if (!file) {
      return errorHandler(res, 400, "File is required");
    }

    const result = await uploadFileService({ userId, file });
    return successHandler(res, "File uploaded successfully", result);
  } catch (error) {
    return errorHandler(res, 400, (error as Error).message);
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    console.log("res: ", req.body);
    return res.send("ok");

    // console.log("req: ", req);
    const users = await UserModel.find(
      { role: "user" },
      { userName: 1, totalSizeBytes: 1, consumeSizeBytes: 1 },
    )
      .lean()
      .exec();
    console.log("users: ", users);
    if (!users || users.length === 0) {
      return errorHandler(res, 400, "Users not available.");
    }

    const transformedUsers = users.map((user) => {
      const totalBytes = user.totalSizeBytes;
      const consumedBytes = user.consumeSizeBytes;
      const availableBytes = Math.max(0, totalBytes - consumedBytes);
      return {
        // _id: user._id.toString(),
        // userName: user.userName,
        // totalSize: convertBytes(totalBytes),
        // consumedSize: convertBytes(consumedBytes),
        // availableSize: convertBytes(availableBytes),
        _id: user._id.toString(),
        userName: user.userName,
        totalSize: totalBytes,
        consumedSize: consumedBytes,
        availableSize: availableBytes,
      };
    });
    console.log("transformedUsers: ", transformedUsers);
    console.log("Yash Pate===============");
    return res.send({ result: transformedUsers });
    // return successHandler(res, "Users fetched successfully", transformedUsers);
  } catch (error) {
    return errorHandler(res, 400, (error as Error).message);
  }
};

export const updateUserAccess = async (req: Request, res: Response) => {
  try {
    const { _id } = req.params;
    const { totalSizeBytes } = req.body;

    if (!isValidStorageSize(totalSizeBytes)) {
      return errorHandler(res, 400, "Total Size must be a non-negative number");
    }

    const user = await UserModel.findById(_id);
    if (!user) {
      return errorHandler(res, 400, "User not found");
    }

    if (totalSizeBytes < user.consumeSizeBytes) {
      return errorHandler(
        res,
        400,
        "Total Size cannot be less than the consumed storage",
      );
    }

    const updatedUser = await UserModel.findByIdAndUpdate(
      _id,
      { $set: { totalSizeBytes } },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );
    if (!updatedUser) {
      return errorHandler(res, 400, "Error while updating the data.");
    }

    return successHandler(res, "User data updated successfully", updatedUser);
  } catch (error) {
    return errorHandler(res, 400, (error as Error).message);
  }
};
