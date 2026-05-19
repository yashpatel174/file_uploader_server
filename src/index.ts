import express from "express";
import cors from "cors";
import routes from "./routes/csv.routes";
import dotenv from "dotenv";
import { connectDB } from "./config/db";
const app = express();

dotenv.config({ quiet: true });

app.use(express.json());

app.use(cors({ origin: "http://localhost:5173", credentials: true }));

app.use("/", routes);

connectDB();

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
