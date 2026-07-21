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

  const resource = unit === "size" ? "storage" : "usage time";

  const subject = `${severity}: ${threshold}% ${
    unit === "size" ? "Storage" : "Usage Time"
  } Limit ${threshold === 100 ? "Reached" : "Used"}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>${severity}: Resource Usage Notification</h2>

      <p>Hello ${userName},</p>

      <p>
        Your ${resource} consumption has reached
        <strong>${threshold}%</strong> of the allocated limit.
      </p>

      ${
        threshold < 100
          ? `
      <p>
        Once your usage reaches <strong>100%</strong>, new uploads and other
        operations may be blocked.
      </p>
      `
          : `
      <p>
        You have exceeded your allocated ${resource} limit.
      </p>
      `
      }

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
