import axios from "axios";
import type { files } from "dropbox";
import { Dropbox } from "dropbox";
import { Response } from "express";
import fs from "fs/promises";
import { ENV } from "../config/env";
import { UploadResult } from "../types/upload";
import { classifyUploadError } from "../utils/classify-upload-error";
import { UploadSource } from "../utils/fileUpload";

type DropboxDownloadResult = files.FileMetadata & {
  fileBinary: Buffer;
};

export const dropbox_platform = async (
  user: any,
  file: UploadSource,
  storageKey: string,
): Promise<UploadResult> => {
  try {
    const dbx = new Dropbox({
      accessToken: user.dropboxAccessToken,
    });
    const dropboxPath = `/Audio/${storageKey}`;
    const fileBuffer = await fs.readFile(file.path);

    const {
      result: { name, id, path_display },
    } = await dbx.filesUpload({
      path: dropboxPath,
      contents: fileBuffer,
      autorename: true,
      mode: {
        ".tag": "add",
      },
      mute: false,
    });

    const fileData = {
      fileName: name,
      remoteFileId: id,
      remotePath: path_display!,
    };
    return { fileData, message: "File Uploaded successfully on Dropbox" };
  } catch (error) {
    throw new Error(classifyUploadError(error).message);
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

  const { fileBinary } =
    dropboxResponse.result as unknown as DropboxDownloadResult;

  const buffer: Buffer = fileBinary;
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
  try {
    const dbx = new Dropbox({
      accessToken,
    });

    await dbx.filesDeleteV2({
      path: fileId,
    });
  } catch (error) {
    throw new Error(classifyUploadError(error).message);
  }
};
