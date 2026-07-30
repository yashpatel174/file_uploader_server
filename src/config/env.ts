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
  email_host: process.env.SMTP_HOST as string,
  email_port: Number(process.env.SMTP_PORT),
  email_user: process.env.SMTP_USER as string,
  email_password: process.env.SMTP_PASSWORD as string,
  smtp_from: process.env.SMTP_FROM as string,
  rabbitmq_url: process.env.RABBITMQ_URL as string,
};
