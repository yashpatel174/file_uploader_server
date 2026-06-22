import fs from "fs";
import path from "path";

export const privateKey = fs.readFileSync(
  path.join(__dirname, "./private.pem"),
  "utf8",
);

export const publicKey = fs.readFileSync(
  path.join(__dirname, "./public.pem"),
  "utf8",
);
