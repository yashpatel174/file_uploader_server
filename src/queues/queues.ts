import { Channel } from "amqplib";
import { QUEUES } from "./queueNames";

export const setupQueues = async (channel: Channel) => {
  await channel.assertQueue(QUEUES.FILE_UPLOAD, {
    durable: true,
  });

  await channel.assertQueue(QUEUES.FILE_UPLOAD_RETRY, {
    durable: true,
    arguments: {
      "x-message-ttl": 30000,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": QUEUES.FILE_UPLOAD,
    },
  });
};
