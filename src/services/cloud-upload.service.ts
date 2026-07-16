import { UploadResult } from "../types/upload";
import { uploadToFTP } from "./ftp";
import { uploadToSFTP } from "./sftp";

type Platform = "ftp" | "sftp";

interface UploadConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export const uploadFileToCloud = async (
  platform: Platform,
  localFilePath: string,
  remoteFilePath: string,
  config: UploadConfig,
): Promise<UploadResult> => {
  let data;
  switch (platform) {
    case "sftp":
      data = await uploadToSFTP(localFilePath, remoteFilePath, config);
      break;

    case "ftp":
      data = await uploadToFTP(localFilePath, remoteFilePath, config);
      break;

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  return data;
};
