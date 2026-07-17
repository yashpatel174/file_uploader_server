export interface DeleteFilePayload {
  platform: "sftp" | "ftp" | "dropbox" | "drive";
  remotePath?: string;
  remoteFileId?: string;
}

import { Types } from "mongoose";
import { deleteFromDropbox, refreshDropboxToken } from "./dropbox";
import { deleteFromFTP } from "./ftp";
import { deleteFromGoogleDrive } from "./google";
import { deleteFromSFTP } from "./sftp";

export const deleteFileByPlatform = async ({
  file,
  clientId,
  clientSecretKey,
  accessToken,
  refreshToken,
  appKey,
  appSecret,
  userId,
}: {
  file: DeleteFilePayload;
  clientId?: string;
  clientSecretKey?: string;
  accessToken?: string;
  refreshToken?: string;
  appKey?: string;
  appSecret?: string;
  userId: Types.ObjectId;
}): Promise<void> => {
  switch (file.platform) {
    case "ftp":
      return deleteFromFTP(file.remotePath!);

    case "sftp":
      return deleteFromSFTP(file.remotePath!);

    case "dropbox":
      const dropboxNewToken = await refreshDropboxToken(
        refreshToken!,
        appKey!,
        appSecret!,
        userId,
      );
      return deleteFromDropbox(file.remoteFileId as string, dropboxNewToken!);

    case "drive":
      return deleteFromGoogleDrive(
        file.remoteFileId!,
        clientId as string,
        clientSecretKey as string,
        accessToken as string,
      );

    default:
      throw new Error("Unsupported platform");
  }
};
