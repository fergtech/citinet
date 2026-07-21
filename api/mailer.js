/**
 * Email notifications — generic SMTP via nodemailer.
 *
 * Configure per-hub via env vars (set in the hub's .env, alongside TUNNEL_URL etc):
 *   SMTP_HOST     required to enable email — sendEmail() is a silent no-op without it
 *   SMTP_PORT     defaults to 587
 *   SMTP_SECURE   'true' for implicit TLS (port 465); leave unset for STARTTLS (587)
 *   SMTP_USER     optional — omit for unauthenticated relays
 *   SMTP_PASS
 *   SMTP_FROM     defaults to SMTP_USER
 *
 * Works with any SMTP provider (Postmark, Resend, SES, a self-hosted relay, etc.) —
 * no vendor-specific SDK, consistent with the rest of the stack staying self-hostable.
 */

const nodemailer = require('nodemailer');

let transporter = null;
let attempted = false;

function getTransporter() {
  if (attempted) return transporter;
  attempted = true;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

/** Fire-and-forget safe — never throws. No-ops silently if SMTP isn't configured
 * or `to` is empty, so hubs that haven't set up email are unaffected. */
async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t || !to) return;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }
}

module.exports = { sendEmail };
