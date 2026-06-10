import { Document, Schema, Types, model } from "mongoose";

export interface IFile extends Document {
  userId: Types.ObjectId;
  platform: "dropbox" | "drive" | "ftp" | "sftp";
  fileName: string;
  remoteFileId: string | null;
  remotePath: string;
  sizeBytes: number;
  timeDuration: number;
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
    remoteFileId: {
      type: String,
      default: null,
      index: true,
    },
    remotePath: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
    },
    timeDuration: {
      type: Number,
    },
  },
  { timestamps: true },
);

// Index for user file lookup
fileSchema.index({ userId: 1, createdAt: -1 });
fileSchema.index({ platform: 1, remoteFileId: 1 });
fileSchema.index({ platform: 1, remotePath: 1 });

export const FileModel = model<IFile>("File", fileSchema);
