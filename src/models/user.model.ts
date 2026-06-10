import { Document, Schema, model } from "mongoose";

export type UserRole = "admin" | "user";
export type UnitInterface = "size" | "time";

export interface IUser extends Document {
  userName: string;
  role: UserRole;
  unit: UnitInterface;
  totalSizeBytes: number; // max allowed storage
  consumeSizeBytes: number; // used storage
  totalTime: number;
  consumedTime: number;
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken: string;
  googleAccessTokenExpiry: Date;
  googleRefreshTokenEnc: string;
  dropboxAppKey: string;
  dropboxSecretKey: string;
  dropboxAccountId: string;
  dropboxAccessToken: string;
  dropboxRefreshToken: string;
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
    unit: {
      type: String,
      enum: ["size", "time"],
      required: true,
    },
    totalSizeBytes: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    consumeSizeBytes: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalTime: {
      type: Number,
      required: true,
      min: 0,
      default: 600,
    },
    consumedTime: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    googleClientId: {
      type: String,
      select: false,
      default: null,
    },
    googleClientSecret: {
      type: String,
      select: false,
      default: null,
    },
    googleAccessToken: {
      type: String,
      select: false,
      default: null,
    },
    googleRefreshTokenEnc: {
      type: String,
      select: false,
      default: null,
    },
    googleAccessTokenExpiry: {
      type: Date,
      select: false,
      default: null,
    },
    dropboxAppKey: {
      type: String,
      select: false,
      default: null,
    },
    dropboxSecretKey: {
      type: String,
      select: false,
      default: null,
    },
    dropboxAccountId: {
      type: String,
      select: false,
      default: null,
    },
    dropboxAccessToken: {
      type: String,
      select: false,
      default: null,
    },
    dropboxRefreshToken: {
      type: String,
      select: false,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index for fast lookup
userSchema.index({ userName: 1, role: 1 });
userSchema.index({ _id: 1, totalSizeBytes: 1, consumeSizeBytes: 1 });

export const UserModel = model<IUser>("User", userSchema);
