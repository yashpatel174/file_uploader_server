import { getChannel } from "../config/rabbitmq";
import { FileModel } from "../models/file.model";
import { UserModel } from "../models/user.model";
import { processUpload } from "../workers/upload.worker";
import { publishRetryJob } from "./producer";
import { QUEUES } from "./queueNames";
import { setupQueues } from "./queues";

export const startConsumer = async () => {
  const channel = getChannel();

  await setupQueues(channel);

  channel.prefetch(1);

  await channel.consume(QUEUES.FILE_UPLOAD, async (msg) => {
    if (!msg) return;
    try {
      const { jobId } = JSON.parse(msg.content.toString());
      const job = await FileModel.findOneAndUpdate(
        {
          _id: jobId,
          status: "queued",
        },
        {
          $set: {
            status: "processing",
          },
          $inc: {
            attemptCount: 1,
          },
        },
        {
          returnDocument: "after",
          lean: true,
        },
      );

      if (!job) {
        console.log(`Job already processed or not found: ${jobId}`);
        channel.ack(msg);
        return;
      }

      const user = await UserModel.findOneAndUpdate(
        { _id: job.userId },
        { $set: { isDeleting: false } },
        { returnDocument: "after" },
      )
        .select({
          userName: 1,
          email: 1,
          dropboxAccessToken: 1,
          googleClientId: 1,
          googleClientSecret: 1,
          googleAccessToken: 1,
          unit: 1,
        })
        .lean();

      if (!user) {
        throw new Error("User not found");
      }

      try {
        await processUpload({
          user,
          userId: String(job.userId),
          platform: job.platform,
          storageKey: job.storageKey,
          durationInSeconds: job.timeDuration,
          fileSizeBytes: job.sizeBytes,
          uploadSource: {
            path: job.localFilePath,
            originalname: job.fileName,
            mimetype: job.mimeType,
            size: job.sizeBytes,
          },
        });

        channel.ack(msg);
      } catch (error) {
        await FileModel.updateOne(
          { _id: job._id },
          {
            $set: {
              status: "failed",
            },
          },
        );

        throw error;
      }
    } catch (error) {
      console.error(error);

      const { jobId } = JSON.parse(msg.content.toString());

      const job = await FileModel.findById(jobId)
        .select({
          attemptCount: 1,
          maxAttempts: 1,
        })
        .lean();

      if (!job) {
        channel.ack(msg);
        return;
      }

      if (job.attemptCount < job.maxAttempts) {
        await FileModel.updateOne(
          { _id: jobId },
          {
            $set: {
              status: "queued",
            },
          },
        );

        await publishRetryJob(jobId);

        channel.ack(msg);
        return;
      }

      await FileModel.updateOne(
        { _id: jobId },
        {
          $set: {
            status: "failed",
          },
        },
      );

      channel.ack(msg);
    }
  });
};
