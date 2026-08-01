import { Document, Schema, Types, model } from "mongoose";
import { randomUUID } from "node:crypto";
import { UPLOAD_STATUS, UploadStatus } from "./uploadJob.model";

export interface IFile extends Document {
  userId: Types.ObjectId;
  storageKey: string;
  status: UploadStatus;
  publishStatus: "pending" | "published";
  platform: "dropbox" | "drive" | "ftp" | "sftp";
  fileName: string;
  remoteFileId: string | null;
  remotePath: string;
  localFilePath: string;
  mimeType: string;
  sizeBytes: number;
  timeDuration: number;
  attemptCount: number;
  maxAttempts: number;
  isDeleted: boolean;
  createdAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    storageKey: {
      type: String,
      default: () => randomUUID(),
      immutable: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: UPLOAD_STATUS,
      required: true,
    },
    publishStatus: {
      type: String,
      enum: ["pending", "published"],
      default: "pending",
      index: true,
    },
    platform: {
      type: String,
      enum: ["dropbox", "drive", "ftp", "sftp"],
      required: true,
      index: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    localFilePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    remoteFileId: {
      type: String,
      default: null,
      index: true,
    },
    remotePath: {
      type: String,
      required: true,
      default: "Pending",
    },
    sizeBytes: {
      type: Number,
    },
    timeDuration: {
      type: Number,
    },
    isDeleted: { type: Boolean, required: true, default: true },
    attemptCount: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
  },
  { timestamps: true },
);

// Index for user file lookup
fileSchema.index({ userId: 1, createdAt: -1 });
fileSchema.index({ userId: 1, isDeleted: 1 });
fileSchema.index({ platform: 1, remoteFileId: 1 });
fileSchema.index({ platform: 1, remotePath: 1 });

export const FileModel = model<IFile>("File", fileSchema);
