import { Document, model, Schema, Types } from "mongoose";
import { randomUUID } from "node:crypto";

export const UPLOAD_STATUS = [
  "queued",
  "processing",
  "uploaded",
  "failed",
  "cancelled",
] as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[number];

export const PLATFORMS = ["drive", "dropbox", "ftp", "sftp"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const FAILURE_TYPES = [
  "network",
  "authentication",
  "quota",
  "validation",
  "provider",
  "file",
  "internal",
  "unknown",
] as const;

export type FailureType = (typeof FAILURE_TYPES)[number];

interface IUploadAttempt {
  attemptNo: number;
  startedAt: Date;
  endedAt?: Date;
  status: UploadStatus;
  errorCode?: string;
  errorMessage?: string;
}

interface ILastError {
  code?: string;
  message?: string;
  provider?: string;
  failureType?: FailureType;
}

export interface IUploadJob extends Document {
  jobId: string;
  userId: Types.ObjectId;
  platform: Platform;
  originalFileName: string;
  localFilePath: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  timeDuration: number;
  status: UploadStatus;
  attemptCount: number;
  maxAttempts: number;
  retryable: boolean;
  lastError: ILastError | null;
  attempts: IUploadAttempt[];
  uploadedFileId: Types.ObjectId | null;
  remoteFileId: string | null;
  remotePath: string | null;
  lockedAt: Date | null;
  processingBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const uploadAttemptSchema = new Schema<IUploadAttempt>(
  {
    attemptNo: {
      type: Number,
      required: true,
      min: 1,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: Date,
    status: {
      type: String,
      enum: UPLOAD_STATUS,
      required: true,
    },
    errorCode: String,
    errorMessage: String,
  },
  {
    _id: false,
  },
);

const uploadJobSchema = new Schema<IUploadJob>(
  {
    jobId: {
      type: String,
      default: () => randomUUID(),
      immutable: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: PLATFORMS,
      required: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    localFilePath: {
      type: String,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    timeDuration: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: UPLOAD_STATUS,
      default: "queued",
      required: true,
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    maxAttempts: {
      type: Number,
      default: 5,
      immutable: true,
      min: 1,
    },
    retryable: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastError: {
      code: String,
      message: String,
      provider: String,
      failureType: {
        type: String,
        enum: FAILURE_TYPES,
      },
    },
    attempts: {
      type: [uploadAttemptSchema],
      default: [],
    },
    uploadedFileId: {
      type: Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },
    remoteFileId: {
      type: String,
      default: null,
    },
    remotePath: {
      type: String,
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
      index: true,
    },
    processingBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/**
 * =====================================================
 * INDEXES
 * =====================================================
 */

/**
 * Failed Reports
 */
uploadJobSchema.index({
  status: 1,
  createdAt: -1,
});

/**
 * Retry Queue
 */
uploadJobSchema.index({
  status: 1,
  retryable: 1,
  attemptCount: 1,
});

/**
 * User History
 */
uploadJobSchema.index({
  userId: 1,
  createdAt: -1,
});

/**
 * User + Platform
 */
uploadJobSchema.index({
  userId: 1,
  platform: 1,
  createdAt: -1,
});

/**
 * File List
 */
uploadJobSchema.index({
  userId: 1,
  platform: 1,
  status: 1,
});

/**
 * Uploaded File Lookup
 */
uploadJobSchema.index({
  uploadedFileId: 1,
});

/**
 * Duplicate Lock Protection
 */
uploadJobSchema.index({
  lockedAt: 1,
  status: 1,
});

uploadJobSchema.index({
  userId: 1,
  status: 1,
  createdAt: -1,
});

export const UploadJobModel = model<IUploadJob>("UploadJob", uploadJobSchema);
