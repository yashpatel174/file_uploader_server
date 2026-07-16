import { Document, Schema, model } from "mongoose";

export type UserRole = "admin" | "user";
export type UnitInterface = "size" | "time";

export interface IUser extends Document {
  email: string;
  userName: string;
  password: string;
  isActive: boolean;
  role: UserRole;
  unit: UnitInterface;
  consumedTimePercent: number;
  consumedSizePercent: number;
  totalSizeBytes: number;
  consumeSizeBytes: number;
  totalTime: number;
  consumedTime: number;
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken: string;
  googleAccessTokenExpiry: Date;
  googleRefreshTokenEnc: string;
  googleAuthenticated: boolean;
  dropboxAppKey: string;
  dropboxSecretKey: string;
  dropboxAccountId: string;
  dropboxAccessToken: string;
  dropboxRefreshToken: string;
  dropboxAuthenticated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, trim: true },
    userName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    password: { type: String, trim: true, select: false },
    isActive: { type: Boolean, required: true, default: false },
    role: {
      type: String,
      enum: ["admin", "user"],
      required: true,
      index: true,
    },
    unit: { type: String, enum: ["size", "time"], required: true },
    consumedTimePercent: { type: Number, required: true, default: 0 },
    consumedSizePercent: { type: Number, required: true, default: 0 },
    totalSizeBytes: { type: Number, required: true, min: 0, default: 0 },
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
    googleAccessTokenExpiry: { type: Date, select: false, default: null },
    googleAuthenticated: {
      type: Boolean,
      default: false,
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
    dropboxAuthenticated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index for fast lookup
userSchema.index({ userName: 1, role: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ _id: 1, totalSizeBytes: 1, consumeSizeBytes: 1 });

export const UserModel = model<IUser>("User", userSchema);
