import { Request, Response } from "express";
import { google } from "googleapis";
import { UserModel } from "../../models/user.model";
import { errorHandler, successHandler } from "../../utils/responseHandler";

export const googleAuth = async (
  clientId: string,
  clientSecret: string,
  accessToken: string,
) => {
  const authentication = await new google.auth.OAuth2(clientId, clientSecret);
  authentication.setCredentials({ access_token: accessToken });
};

export const connectGoogle = async (req: Request, res: Response) => {
  const { code, _id, clientId, clientSecretKey } = req.body;

  if (!code) return errorHandler(res, "At least one field is required");

  const oauth = new google.auth.OAuth2(
    clientId,
    clientSecretKey,
    "postmessage",
  );

  let tokens;
  try {
    const response = await oauth.getToken(code);
    tokens = response.tokens;
  } catch (err) {
    return errorHandler(res, "Invalid google code");
  }

  if (!tokens.access_token) {
    return errorHandler(res, "Access token is not generated");
  }

  // ✅ Fetch existing user (to preserve refresh_token)
  const user = await UserModel.findById(_id)
    .select("googleRefreshTokenEnc")
    .lean();
  if (!user) return errorHandler(res, "User not found");

  await UserModel.updateOne(
    { _id },
    {
      $set: {
        googleClientId: clientId,
        googleClientSecret: clientSecretKey,
        googleAccessToken: tokens.access_token,
        googleAccessTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3500 * 1000),
        googleRefreshTokenEnc: tokens.refresh_token,
      },
    },
  );

  return successHandler(res, "Google Authenticated successfully");
};

export const getValidGoogleAccessToken = async (
  googleClientId: string,
  googleClientSecret: string,
  googleRefreshToken: string,
  accessTokenExpiry: Date,
) => {
  const oauth2Client = new google.auth.OAuth2(
    googleClientId,
    googleClientSecret,
  );

  oauth2Client.setCredentials({
    refresh_token: googleRefreshToken,
  });

  const isExpired =
    Date.now() >= new Date(accessTokenExpiry).getTime() - 5 * 60 * 1000;

  if (!isExpired) {
    null;
  }

  const { credentials } = await oauth2Client.refreshAccessToken();

  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date,
  };
};
