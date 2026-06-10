import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const ENV = {
  PORT: process.env.PORT || 3010,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGO_URI: process.env.DATABASE as string,
  sftp_host: process.env.SFTP_HOST as string,
  sftp_username: process.env.SFTP_USERNAME as string,
  sftp_password: process.env.SFTP_PASSWORD as string,
  sftp_port: Number(process.env.SFTP_PORT),
  ftp_port: Number(process.env.FTP_PORT),
  google_scope: process.env.GOOGLE_SCOPE,
  google_redirect_url: process.env.GOOGLE_REDIRECT_URI,
  dropbox_redirect_url: process.env.DROPBOX_REDIRECT_URI,
  dropbox_auth_url: process.env.DROPBOX_AUTH_URL,
  dropbox_token: process.env.DROPBOX_TOKEN,
};
