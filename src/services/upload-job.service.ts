import fs from "node:fs/promises";
import { UploadJobModel } from "../models/uploadJob.model";
import { UnitInterface, UserModel } from "../models/user.model";
import { classifyUploadError } from "../utils/classify-upload-error";
import {
  getAudioDuration,
  IPlatform,
  uploadFileService,
} from "../utils/fileUpload";
import { buildStorageKey } from "../utils/storageKey";
import { sendQuotaNotification } from "../utils/quotation";
import { unitComparison } from "../utils/unitComparison";

export const createUploadJobService = async ({
  user,
  userId,
  uploadSource,
  unit,
  platform,
}: {
  user: any;
  userId: string;
  uploadSource: Express.Multer.File;
  unit: UnitInterface;
  platform: IPlatform;
}) => {
  const storageKey = buildStorageKey(user.userName, uploadSource.originalname);

  try {
    const result = await uploadFileService({
      user,
      userId,
      uploadSource,
      unit,
      platform,
      storageKey,
    });

    return result;
  } catch (error) {
    const classified = classifyUploadError(error);

    const duration =
      unit === "time"
        ? (await getAudioDuration(uploadSource.path)).durationInSeconds
        : 0;

    const uploadJob = await UploadJobModel.create({
      userId,
      platform,
      unit,
      originalFileName: uploadSource.originalname,
      storageKey,
      mimeType: uploadSource.mimetype,
      sizeBytes: uploadSource.size,
      timeDuration: duration,
      status: "failed",
      retryable: true,
      attemptCount: 0,
      localFilePath: uploadSource.path,
      lastError: classified,
      attempts: [],
    });

    const toMail = unitComparison(0, 100);

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

    throw {
      error: classified.message,
      jobId: uploadJob.jobId,
    };
  }
};

export const getFailedUploadsService = async ({
  page,
  limit,
}: {
  page: number;
  limit: number;
}) => {
  const skip = (page - 1) * limit;

  const [result, total] = await Promise.all([
    UploadJobModel.find(
      {
        status: "failed",
      },
      {
        platform: 1,
        retryId: 1,
        attemptCount: 1,
        lastError: 1,
        jobId: 1,
        _id: 0,
        retryable: 1,
        unit: 1,
        sizeBytes: 1,
        timeDuration: 1,
      },
    )
      .populate({
        path: "userId",
        select: "userName -_id",
      })
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    UploadJobModel.countDocuments({
      status: "failed",
    }),
  ]);

  const jobs =
    result.length &&
    result.map((r) => {
      return {
        ...r,
        limit: r.unit === "size" ? r.sizeBytes : r.timeDuration,
      };
    });

  return {
    jobs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const retryUploadService = async (jobId: string) => {
  const uploadJob = await UploadJobModel.findOne({
    jobId,
  });

  if (!uploadJob) {
    throw new Error("Upload job not found");
  }

  if (uploadJob.attemptCount >= uploadJob.maxAttempts) {
    throw new Error("Maximum retry attempts exceeded");
  }

  if (uploadJob.status !== "failed") {
    throw new Error("Only failed uploads can be retried");
  }

  if (!uploadJob.retryable) {
    throw new Error("This upload cannot be retried");
  }

  const locked = await UploadJobModel.findOneAndUpdate(
    {
      _id: uploadJob._id,
      lockedAt: null,
    },
    {
      $set: {
        lockedAt: new Date(),
        processingBy: process.pid.toString(),
        status: "processing",
      },
    },
    {
      returnDocument: "after",
    },
  );

  if (!locked) {
    throw new Error("Upload is already being processed");
  }

  await fs.access(uploadJob.localFilePath);

  let projection = "role email userName";

  if (uploadJob.platform === "drive") {
    projection += " googleClientId googleClientSecret googleAccessToken";
  }

  if (uploadJob.platform === "dropbox") {
    projection += " dropboxAccessToken";
  }

  const user = await UserModel.findById(uploadJob.userId)
    .select(projection)
    .lean();

  if (!user) {
    throw new Error("User not found");
  }
  const attemptNo = uploadJob.attemptCount + 1;

  await UploadJobModel.updateOne(
    {
      _id: uploadJob._id,
    },
    {
      $inc: {
        attemptCount: 1,
      },
      $push: {
        attempts: {
          attemptNo,
          startedAt: new Date(),
          status: "processing",
        },
      },
    },
  );

  try {
    const result = await uploadFileService({
      user,
      userId: uploadJob.userId.toString(),
      uploadSource: {
        path: uploadJob.localFilePath,
        originalname: uploadJob.originalFileName,
        mimetype: uploadJob.mimeType,
        size: uploadJob.sizeBytes,
      },
      storageKey: uploadJob.storageKey,
      unit: uploadJob.timeDuration > 0 ? "time" : "size",
      platform: uploadJob.platform,
    });

    await UploadJobModel.deleteOne({
      _id: uploadJob._id,
    });

    return {
      message: "File uploaded successfully.",
      jobId: uploadJob.jobId,
      uploadedFileId: result.uploadedFileId,
      remoteFileId: result.remoteFileId,
      remotePath: result.remotePath,
      status: "uploaded",
    };
  } catch (error) {
    const classified = classifyUploadError(error);

    await UploadJobModel.updateOne(
      {
        _id: uploadJob._id,
      },
      {
        $set: {
          status: "failed",
          retryable: attemptNo < uploadJob.maxAttempts,
          lastError: classified,
          lockedAt: null,
          processingBy: null,
          "attempts.$[attempt].status": "failed",
          "attempts.$[attempt].endedAt": new Date(),
          "attempts.$[attempt].errorCode": classified.code,
          "attempts.$[attempt].errorMessage": classified.message,
        },
      },
      {
        arrayFilters: [
          {
            "attempt.attemptNo": attemptNo,
          },
        ],
      },
    );

    throw error;
  }
};
