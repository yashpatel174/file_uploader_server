import { Document, Schema, Types, model } from "mongoose";

export interface IToken extends Document {
  userId: Types.ObjectId;
  refreshToken: string;
  createdAt: Date;
  expiresAt: Date;
}

const tokenSchema = new Schema<IToken>(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
    },
    refreshToken: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

tokenSchema.index({ userId: 1 });
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TokenModel = model<IToken>("Token", tokenSchema);
