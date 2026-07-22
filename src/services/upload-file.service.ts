import { FileModel } from "../models/file.model";
import { UploadJobModel } from "../models/uploadJob.model";
import { IPlatform } from "../utils/fileUpload";

interface UploadFilesParams {
  page: number;
  limit: number;
  userId?: string | undefined;
  platform?: IPlatform | undefined;
  search?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export const uploadFilesService = async ({
  page,
  limit,
  userId,
  platform,
  search,
  startDate,
  endDate,
}: UploadFilesParams) => {
  const match: any = {};

  if (userId) {
    match.userId = userId;
  }

  if (platform) {
    match.platform = platform;
  }

  if (search) {
    match.fileName = {
      $regex: search,
      $options: "i",
    };
  }

  if (startDate || endDate) {
    match.createdAt = {};

    if (startDate) {
      match.createdAt.$gte = new Date(startDate);
    }

    if (endDate) {
      match.createdAt.$lte = new Date(endDate);
    }
  }

  const uploaded = await FileModel.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $project: {
        _id: 0,
        userId: 1,
        userName: "$user.userName",
        platform: 1,
      },
    },
  ]);

  const failed = await UploadJobModel.aggregate([
    {
      $match: {
        status: "failed",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
    {
      $project: {
        _id: 0,
        userId: 1,
        userName: "$user.userName",
        platform: 1,
      },
    },
  ]);
  const result = Array.from(
    new Map(
      [...uploaded, ...failed]
        .sort((a, b) => a.platform.localeCompare(b.platform))
        .map((item) => [`${item.userName}-${item.platform}`, item]),
    ).values(),
  );

  const total = result.length;

  return {
    data: result,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
