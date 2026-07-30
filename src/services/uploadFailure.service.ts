import { UploadJobModel } from "../models/uploadJob.model";
import { classifyUploadError } from "../utils/classify-upload-error";
import { getAudioDuration, IPlatform, UploadSource } from "../utils/fileUpload";
import { sendQuotaNotification } from "../utils/quotation";
import { unitComparison } from "../utils/unitComparison";

export const handleUploadFailure = async ({
  error,
  user,
  userId,
  uploadSource,
  unit,
  platform,
  storageKey,
}: {
  error: unknown;
  user: any;
  userId: string;
  uploadSource: UploadSource;
  unit: "size" | "time";
  platform: IPlatform;
  storageKey: string;
}) => {
  const classified = classifyUploadError(error);

  const duration =
    unit === "time"
      ? (await getAudioDuration(uploadSource.path)).durationInSeconds
      : 0;

  const uploadJob = await UploadJobModel.create({
    userId,
    platform,
    unit,
    originalFileName: uploadSource.originalname,
    storageKey,
    mimeType: uploadSource.mimetype,
    sizeBytes: uploadSource.size,
    timeDuration: duration,
    status: "failed",
    retryable: true,
    attemptCount: 0,
    localFilePath: uploadSource.path,
    lastError: classified,
    attempts: [],
  });

  const toMail = unitComparison(0, 100);

  if (toMail.isMail && toMail.value) {
    try {
      await sendQuotaNotification({
        email: user.email,
        userName: user.userName,
        threshold: toMail.value,
        unit,
      });
    } catch (mailError) {
      console.error("Quota email failed:", (mailError as Error).message);
    }
  }

  return uploadJob;
};
