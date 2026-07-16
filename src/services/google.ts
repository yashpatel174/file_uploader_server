import { Response } from "express";
import fs from "fs";
import { google } from "googleapis";
import { UploadResult } from "../types/upload";
import { classifyUploadError } from "../utils/classify-upload-error";

export const google_drive = async (
  user: any,
  file: { originalname: string; mimetype: string; path: string },
  storageKey: string,
): Promise<UploadResult> => {
  try {
    const auth = new google.auth.OAuth2(
      user.googleClientId,
      user.googleClientSecret,
    );

    auth.setCredentials({
      access_token: user.googleAccessToken,
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    const folderResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Audio' and trashed=false",
      fields: "files(id, name)",
    });

    let audioFolderId = folderResponse.data.files?.[0]?.id;

    if (!audioFolderId) {
      const createdFolder = await drive.files.create({
        requestBody: {
          name: "Audio",
          mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id",
      });

      audioFolderId = createdFolder.data.id!;
    }

    const uploadResponse = await drive.files.create({
      requestBody: {
        name: storageKey,
        parents: [audioFolderId],
      },
      media: {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      },
      fields: "id,name,webViewLink",
    });
    const uploadedFile = uploadResponse.data;
    const fileData = {
      fileName: uploadedFile.name as string,
      remoteFileId: uploadedFile.id as string,
      remotePath: `/Audio/${uploadedFile.name}` as string,
    };
    return { fileData, message: "File uploaded successfully on google drive" };
  } catch (error) {
    throw new Error(classifyUploadError(error).message);
  }
};

export const getDriveAccess = async (
  clientId: string,
  clientSecretKey: string,
  accessToken: string,
  fileId: string,
  res: Response,
  access: "read" | "delete",
) => {
  const auth = new google.auth.OAuth2(clientId, clientSecretKey);
  auth.setCredentials({
    access_token: accessToken as string,
  });
  const drive = google.drive({
    version: "v3",
    auth: auth,
  });
  if (access === "read") {
    const response = await drive.files.get(
      {
        fileId: fileId!,
        alt: "media",
      },
      {
        responseType: "stream",
      },
    );
    response.data.pipe(res);
    return;
  } else if (access === "delete") {
    await drive.files.delete({
      fileId,
    });
  }
};

export const deleteFromGoogleDrive = async (
  fileId: string,
  clientId: string,
  clientSecretKey: string,
  accessToken: string,
): Promise<void> => {
  try {
    const auth = new google.auth.OAuth2(clientId, clientSecretKey);

    auth.setCredentials({
      access_token: accessToken,
    });

    const drive = google.drive({
      version: "v3",
      auth,
    });

    await drive.files.delete({
      fileId,
    });
  } catch (error) {
    throw new Error(classifyUploadError(error).message);
    console.error("Google Drive cleanup failed:", (error as Error).message);
  }
};
