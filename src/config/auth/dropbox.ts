import axios from "axios";
import { Request, Response } from "express";
import { UserModel } from "../../models/user.model";
import { classifyCloudError } from "../../utils/classify-api-error";
import { errorHandler, successHandler } from "../../utils/responseHandler";
import { ENV } from "../env";

export const dropboxAuth = async (req: Request, res: Response) => {
  try {
    const { appKey } = req.body;

    const redirectUri = ENV.dropbox_redirect_url as string;

    const url =
      ENV.dropbox_auth_url +
      `?client_id=${appKey}` +
      "&response_type=code" +
      "&token_access_type=offline" +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return res.json({
      success: true,
      url,
    });
  } catch (error) {
    return errorHandler(res, (error as Error).message);
  }
};

export const dropboxExchangeToken = async (req: Request, res: Response) => {
  try {
    const { code, appKey, appSecret, _id } = req.body;

    if (!code || !appKey || !appSecret) {
      return errorHandler(res, "code, appKey and appSecret are required");
    }

    const response = await axios.post(
      ENV.dropbox_token as string,
      new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: appKey,
        client_secret: appSecret,
        redirect_uri: ENV.dropbox_redirect_url as string,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const user = await UserModel.findById(_id).lean();
    if (!user) return errorHandler(res, "User not found");

    const { access_token, refresh_token, account_id } = response.data;

    await UserModel.updateOne(
      { _id },
      {
        $set: {
          dropboxAuthenticated: true,
          dropboxAppKey: appKey,
          dropboxSecretKey: appSecret,
          dropboxAccessToken: access_token,
          dropboxRefreshToken: refresh_token,
        },
      },
    );

    return successHandler(res, "Dropbox Authenticated successfullly");
  } catch (error) {
    const classified = classifyCloudError("dropbox", error);
    return errorHandler(res, classified.message);
  }
};
