import { FileModel } from "../models/file.model";
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

  const [files, total] = await Promise.all([
    FileModel.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "uploadjobs",
          localField: "_id",
          foreignField: "uploadedFileId",
          as: "uploadJob",
        },
      },
      {
        $unwind: { path: "$uploadJob", preserveNullAndEmptyArrays: true },
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
          _id: 1,
          fileName: 1,
          platform: 1,
          remotePath: 1,
          remoteFileId: 1,
          sizeBytes: 1,
          timeDuration: 1,
          createdAt: 1,

          "user._id": 1,
          "user.userName": 1,
          "user.email": 1,

          uploadStatus: "$uploadJob.status",
          uploadJobId: "$uploadJob.jobId",
          attemptCount: "$uploadJob.attemptCount",
        },
      },
    ]),
    FileModel.countDocuments(match),
  ]);

  return {
    data: files,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
