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

export const emailPrompt = (
  title: string,
  summaryTitle: string,
  total: string,
  used: string,
  updated: string,
) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${title}</title>
</head>

<body style="margin:0;padding:40px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table
    width="560"
    cellpadding="0"
    cellspacing="0"
    style="
        background:#ffffff;
        border:1px solid #d9d9d9;
        border-radius:6px;
        padding:35px;
    "
>

<tr>
<td>

<p
style="
margin:0 0 25px;
text-align:center;
font-size:24px;
color:#333;
"
>
Great news, your
<strong>${title.replace(" Has Been Increased", "")}</strong>
has been increased!
</p>

<div
style="
border:1px solid #e6e6e6;
padding:20px;
background:#fafafa;
border-radius:4px;
"
>

<p
style="
margin:0 0 15px;
font-size:18px;
font-weight:bold;
text-align:center;
"
>
${summaryTitle}
</p>

<p style="margin:8px 0;">
&#8226; Previous Limit:
<strong>${total}</strong>
</p>

<p style="margin:8px 0;">
&#8226; Spent Limit:
<strong>${used}</strong>
</p>

<p style="margin:8px 0;">
&#8226; Updated Limit:
<strong>${updated}</strong>
</p>

</div>

<p
style="
margin:30px 0;
text-align:center;
font-size:20px;
font-weight:bold;
color:#2eaf45;
"
>
You can now upload more files without restrictions.
</p>

<p
style="
margin-bottom:10px;
font-size:18px;
font-weight:bold;
"
>
Next Steps:
</p>

<ol
style="
margin-top:0;
padding-left:22px;
line-height:28px;
font-size:16px;
color:#444;
"
>
<li>Try uploading your files again.</li>
<li>Contact our support team if you need further assistance.</li>
</ol>

<p
style="
margin-top:35px;
text-align:center;
color:#666;
font-size:15px;
"
>
Thank you for using our service!
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;
  return html;
};
