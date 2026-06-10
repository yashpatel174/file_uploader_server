import express from "express";
import cors from "cors";
import routes from "./routes/csv.routes";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
import path from "node:path";
const app = express();

dotenv.config({ quiet: true });

app.use(express.json());

app.use(cors());

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
app.use("/uploads", express.static(UPLOADS_DIR));

app.use("/", routes);

connectDB();

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
