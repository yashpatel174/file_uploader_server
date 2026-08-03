import express from "express";
import csvRoute from "./csv.routes";
import userRoute from "./user.routes";
const app = express();

app.use("/", userRoute);
app.use("/", csvRoute);

export default app;
