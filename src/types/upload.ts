export interface UploadResult {
  fileData: {
    fileName: string;
    remoteFileId: string;
    remotePath: string;
  };

  message: string;
}
