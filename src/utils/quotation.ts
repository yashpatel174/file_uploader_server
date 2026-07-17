import { sendMail } from "../config/nodeMailer";

export const getQuotaNotificationTemplate = (
  userName: string,
  threshold: number,
  unit: "size" | "time",
) => {
  const severity =
    threshold === 100
      ? "Blocked"
      : threshold >= 90
        ? "Critical"
        : threshold >= 80
          ? "Warning"
          : "Alert";

  const subject = `${severity}: ${threshold}% ${
    unit === "size" ? "Storage" : "Usage Time"
  } Limit Reached`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>${severity}: Resource Usage Notification</h2>

      <p>Hello ${userName},</p>

      <p>
        Your ${
          unit === "size" ? "storage" : "usage time"
        } consumption has reached
        <strong>${threshold}%</strong> of the allocated limit.
      </p>

      <p>
        Once the limit reaches <strong>100%</strong>,
        new uploads or operations may be blocked.
      </p>

      <p>
        Please review your usage and take any necessary action.
      </p>

      <hr />

      <p>
        Regards,<br />
        System Administration Team
      </p>
    </div>
  `;

  return {
    subject,
    html,
  };
};

export const sendQuotaNotification = async ({
  email,
  userName,
  threshold,
  unit,
}: {
  email: string;
  userName: string;
  threshold: number;
  unit: "size" | "time";
}) => {
  const { subject, html } = getQuotaNotificationTemplate(
    userName,
    threshold,
    unit,
  );

  await sendMail({
    to: email,
    subject,
    html,
  });
};
