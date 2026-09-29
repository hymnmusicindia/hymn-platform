const nodemailer = require("nodemailer");

async function main() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_APP_PASSWORD?.replace(/\s/g, "");
  const port = Number(process.env.SMTP_PORT || 465);
  if (!user || !pass) throw new Error("Set SMTP_USER and SMTP_APP_PASSWORD in the server environment first.");
  if (![465, 587].includes(port)) throw new Error("Use SMTP_PORT=465 or 587 for Gmail.");
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, requireTLS: true, auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 });
  try {
    await transport.verify();
    console.log("SMTP connection and authentication passed. No email was sent. Test an actual account event to verify delivery and sender acceptance.");
  } finally { transport.close(); }
}
main().catch(error => { console.error("SMTP verification failed:", error.code || "CONFIGURATION", error.responseCode || ""); process.exitCode = 1; });
