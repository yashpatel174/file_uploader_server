import mongoose from "mongoose";
import { ENV } from "./env";

export const connectDB = async () => {
  try {
    await mongoose.connect(ENV.MONGO_URI, {
      autoIndex: true,
      maxPoolSize: 10,
    });

    console.log("Database connected successfully!");
  } catch (error) {
    console.log("MongoDB Connection Failed");
    process.exit(1);
  }
};
