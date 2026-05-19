import { Schema, model, Document } from "mongoose";

export type UserRole = "admin" | "user";

export interface IUser extends Document {
  userName: string;
  role: UserRole;
  totalSizeBytes: number; // max allowed storage
  consumeSizeBytes: number; // used storage
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      required: true,
      index: true,
    },
    totalSizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    consumeSizeBytes: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for fast lookup
userSchema.index({ userName: 1, role: 1 });
userSchema.index({ _id: 1, totalSizeBytes: 1, consumeSizeBytes: 1 });

export const UserModel = model<IUser>("User", userSchema);
