import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { connectDB } from "./config/db";
import routes from "./routes/csv.routes";
import { connectRabbitMQ } from "./config/rabbitmq";
import { startConsumer } from "./queues/consumer";
const app = express();

dotenv.config({ quiet: true });

app.use(express.json());

app.use(cors());

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/", routes);

const bootstrap = async () => {
  try {
    await connectDB();
    await connectRabbitMQ();
    await startConsumer();
    const port = process.env.PORT;

    app.listen(port, () => {
      console.log(`Server running on port: ${port}`);
    });
  } catch (error) {
    console.error("Application startup failed:", error);
    process.exit(1);
  }
};

void bootstrap();
