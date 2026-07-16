import { randomUUID } from "crypto";
import path from "node:path";
import SftpClient from "ssh2-sftp-client";
import { ENV } from "../config/env";
import { UploadResult } from "../types/upload";
import { classifyUploadError } from "../utils/classify-upload-error";

interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export const uploadToSFTP = async (
  localFilePath: string,
  remoteFilePath: string,
  config: SftpConfig,
): Promise<UploadResult> => {
  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
    });

    await sftp.put(localFilePath, remoteFilePath);
    const generatedId = randomUUID();

    const fileData = {
      fileName: path.basename(remoteFilePath),
      remoteFileId: generatedId,
      remotePath: remoteFilePath,
    };
    return { fileData, message: "File Uploaded on SFTP Cloud" };
  } catch (e) {
    throw new Error(classifyUploadError(e).message);
  } finally {
    await sftp.end();
  }
};

export const deleteFromSFTP = async (remotePath: string): Promise<void> => {
  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: ENV.sftp_host!,
      port: ENV.sftp_port,
      username: ENV.sftp_username!,
      password: ENV.sftp_password!,
    });

    const exists = await sftp.exists(remotePath);

    if (exists) {
      await sftp.delete(remotePath);
    }
  } catch (error) {
    throw new Error(classifyUploadError(error).message);
  } finally {
    await sftp.end();
  }
};
