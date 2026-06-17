import { Pingram } from "pingram";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateLabel(value) {
  if (!value) return null;
  try {
    return new Date(value + "T12:00:00").toLocaleDateString("en-CA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function pingramClient() {
  if (!process.env.PINGRAM_API_KEY) return null;
  return new Pingram({
    apiKey: process.env.PINGRAM_API_KEY,
    baseUrl: process.env.PINGRAM_BASE_URL || "https://api.ca.pingram.io",
  });
}

export function isEmailConfigured() {
  return !!process.env.PINGRAM_API_KEY;
}

function buildViewingConfirmationContent(inquiry) {
  const firstName = inquiry.first_name || inquiry.firstName || "there";
  const propertyTitle =
    inquiry.property_title || inquiry.propertyTitle || "the property";
  const preferredDate = formatDateLabel(
    inquiry.preferred_viewing_date || inquiry.preferredViewingDate
  );

  const subject = "We received your viewing request — Canary";
  const html = `
    <div style="font-family:'Open Sans','Segoe UI',sans-serif;background:#FAF7F1;color:#0E0F0C;padding:32px 20px">
      <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E5DD;border-radius:16px;padding:32px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px">
          <div style="width:28px;height:28px;border-radius:9999px;background:#0E0F0C"></div>
          <strong style="font-size:18px;letter-spacing:-0.01em">Canary</strong>
        </div>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;letter-spacing:-0.02em">Viewing request received</h1>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#4A4844">
          Hi ${escapeHtml(firstName)}, thanks for reaching out. We've received your viewing request and will get back to you as soon as possible to confirm a time.
        </p>
        <div style="background:#F5F2EC;border:1px solid #E8E5DD;border-radius:12px;padding:16px 18px;margin:0 0 18px">
          <div style="font-size:13px;color:#8E8A80;margin-bottom:6px">Property</div>
          <div style="font-size:16px;font-weight:600">${escapeHtml(propertyTitle)}</div>
          ${
            preferredDate
              ? `<div style="margin-top:12px;font-size:13px;color:#8E8A80">Preferred viewing date</div><div style="font-size:15px;font-weight:500;margin-top:4px">${escapeHtml(preferredDate)}</div>`
              : ""
          }
        </div>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#4A4844">
          If you need to update anything, reply to this email and our team will help.
        </p>
        <p style="margin:18px 0 0;font-size:14px;color:#8E8A80">— Canary Property Management</p>
      </div>
    </div>
  `.trim();

  return { firstName, propertyTitle, preferredDate, subject, html };
}

export async function sendViewingConfirmationEmail(inquiry) {
  const pingram = pingramClient();
  if (!pingram) {
    console.warn("[email] Skipping confirmation — PINGRAM_API_KEY not set.");
    return { skipped: true };
  }

  const to = inquiry.email;
  const { subject, html } = buildViewingConfirmationContent(inquiry);
  const senderName = process.env.EMAIL_SENDER_NAME || "Canary";
  const senderEmail =
    process.env.EMAIL_SENDER_EMAIL || "notifications@canarypm.ca";

  return pingram.send({
    type: process.env.PINGRAM_EMAIL_TYPE || "viewing_request_received",
    to: { email: to },
    email: {
      subject,
      html,
      senderName,
      senderEmail,
    },
  });
}
