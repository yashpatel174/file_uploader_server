import fs from "fs/promises";
import axios from "axios";
import { Dropbox } from "dropbox";
import { ENV } from "../config/env";
import { Response } from "express";

export const dropbox_platform = async (user: any, file: any) => {
  try {
    const dbx = new Dropbox({
      accessToken: user.dropboxAccessToken,
    });
    const fileName = `${Date.now()}-${file.originalname}`;
    const dropboxPath = `/Audio/${fileName}`;
    const fileBuffer = await fs.readFile(file.path);

    const uploadedFile = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileBuffer,
      autorename: true,
      mode: {
        ".tag": "add",
      },
      mute: false,
    });
    const fileData = {
      fileName: uploadedFile.result.name,
      remoteFileId: uploadedFile.result.id,
      remotePath: uploadedFile.result.path_display,
    };
    return { fileData, message: "File Uploaded successfully on Dropbox" };
  } catch (error) {
    throw new Error((error as Error).message);
  }
};

export const refreshDropboxToken = async (
  refreshToken: string,
  appKey: string,
  appSecret: string,
): Promise<string> => {
  const response = await axios.post(
    ENV.dropbox_token as string,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    {
      auth: {
        username: appKey,
        password: appSecret,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  return response.data.access_token;
};

export const dropboxAccess = async (
  accessToken: string,
  remoteFileId: string,
  res: Response,
) => {
  const dbx = new Dropbox({
    accessToken: accessToken,
  });

  const dropboxResponse = await dbx.filesDownload({
    path: remoteFileId,
  });

  const buffer = (await dropboxResponse.result.fileBinary) as any;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${dropboxResponse.result.name}"`,
  );
  res.send(buffer);
  return;
};

export const deleteFromDropbox = async (
  fileId: string,
  accessToken: string,
): Promise<void> => {
  const dbx = new Dropbox({
    accessToken,
  });

  await dbx.filesDeleteV2({
    path: fileId,
  });
};
