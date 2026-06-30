import nodemailer from "nodemailer";
import { ENV } from "./env";

export const transporter = nodemailer.createTransport({
  host: ENV.email_host,
  port: Number(ENV.email_port),
  secure: Number(ENV.email_port) === 465,
  auth: {
    user: ENV.email_user,
    pass: ENV.email_password,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

interface SendMailParams {
  to: string;
  subject: string;
  html: string;
}

export const sendMail = async ({
  to,
  subject,
  html,
}: SendMailParams): Promise<void> => {
  await transporter.sendMail({
    from: ENV.smtp_from,
    to,
    subject,
    html,
  });
};
