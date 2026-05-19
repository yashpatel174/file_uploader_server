import { Schema, model, Document, Types } from "mongoose";

export interface IFile extends Document {
  userId: Types.ObjectId;
  fileName: string;
  sizeBytes: number;
  path: string;
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
    fileName: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

// Index for user file lookup
fileSchema.index({ userId: 1, createdAt: -1 });

export const FileModel = model<IFile>("File", fileSchema);
