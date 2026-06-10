import { Client } from "basic-ftp";
import { randomUUID } from "crypto";
import path from "node:path";
import { ENV } from "../config/env";

const generatedId = randomUUID();

interface FtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export const uploadToFTP = async (
  localFilePath: string,
  remoteFilePath: string,
  config: FtpConfig,
): Promise<any> => {
  const client = new Client();

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure: false,
    });

    await client.uploadFrom(localFilePath, remoteFilePath);

    const fileData = {
      fileName: path.basename(remoteFilePath),
      remoteFileId: generatedId,
      remotePath: remoteFilePath,
    };
    return { fileData, message: "File Uploaded on FTP Cloud" };
  } catch (e) {
    console.log("Error =>", (e as Error).message);
  } finally {
    client.close();
  }
};

export const deleteFromFTP = async (remotePath: string): Promise<void> => {
  const client = new Client();
  try {
    await client.access({
      host: ENV.sftp_host,
      port: ENV.ftp_port,
      user: ENV.sftp_username,
      password: ENV.sftp_password,
    });

    await client.remove(remotePath);
  } catch (e) {
    console.log(
      "Error while deleting data from ftp cloud =>",
      (e as Error).message,
    );
  } finally {
    client.close();
  }
};
