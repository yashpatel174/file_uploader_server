import { Types } from "mongoose";
import { getChannel } from "../config/rabbitmq";
import { QUEUES } from "./queueNames";
import { setupQueues } from "./queues";

export const publishUploadJob = async (jobId: Types.ObjectId) => {
  const channel = getChannel();
  await setupQueues(channel);

  await new Promise<void>((resolve, reject) => {
    channel.sendToQueue(
      QUEUES.FILE_UPLOAD,
      Buffer.from(
        JSON.stringify({
          jobId: jobId.toString(),
        }),
      ),
      {
        persistent: true,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });

  await channel.waitForConfirms();
};

export const publishRetryJob = async (jobId: Types.ObjectId | string) => {
  const channel = getChannel();

  channel.sendToQueue(
    QUEUES.FILE_UPLOAD_RETRY,
    Buffer.from(
      JSON.stringify({
        jobId: jobId.toString(),
      }),
    ),
    {
      persistent: true,
    },
  );
};
