import amqp from "amqplib";
import { ENV } from "./env";

let connection: amqp.ChannelModel;
let channel: amqp.ConfirmChannel;

export const connectRabbitMQ = async () => {
  connection = await amqp.connect(ENV.rabbitmq_url!);
  channel = await connection.createConfirmChannel();
  console.log("RabbitMQ Connected");
  connection.on("error", (error) => {
    console.error("RabbitMQ Connection Error:", error);
  });
  connection.on("close", () => {
    console.error("RabbitMQ Connection Closed");
  });
  return channel;
};

export const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ is not initialized");
  }
  return channel;
};

export const closeRabbitMQ = async () => {
  try {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
    console.log("RabbitMQ Closed Successfully");
  } catch (error) {
    console.error("RabbitMQ Shutdown Error:", error);
  }
};
