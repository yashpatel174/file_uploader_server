import { NativeBuffer, PipelineStage } from "mongoose";
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

  const skip = (page - 1) * limit;

  const pipeline: PipelineStage[] = [
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 0,
        userId: 1,
        userName: "$user.userName",
        platform: 1,
      },
    },
    {
      $unionWith: {
        coll: "uploadjobs",
        pipeline: [
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
          { $unwind: "$user" },
          {
            $project: {
              _id: 0,
              userId: 1,
              userName: "$user.userName",
              platform: 1,
            },
          },
        ],
      },
    },
    {
      $group: {
        _id: {
          userName: "$userName",
          platform: "$platform",
        },
        doc: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$doc" } },
    { $sort: { platform: 1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await FileModel.aggregate(pipeline);

  const data = result.data;
  const total = result.total[0]?.count ?? 0;

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
