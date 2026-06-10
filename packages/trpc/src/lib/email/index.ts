/**
 * Email sending utilities for booking-related transactional emails.
 * Uses Resend — requires RESEND_API_KEY env var.
 * All functions are fire-and-forget (never throw) so email failures
 * never block booking creation/cancellation flows.
 */

import { Resend } from "resend";

// ─── Client ──────────────────────────────────────────────────────────────────

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "BookingAgent <noreply@bookingagent.app>";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BookingEmailData {
  customerName:  string;
  customerEmail: string;
  businessName:  string;
  serviceName:   string;
  staffName:     string;
  startsAt:      Date;
  endsAt:        Date;
  timezone:      string;
  bookingId:     string;
}

// ─── Template helpers ────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;padding:4px 0;width:80px;vertical-align:top">${label}</td>
    <td style="font-size:14px;color:#111827;padding:4px 0 4px 12px">${value}</td>
  </tr>`;
}

function layout(body: string, previewText: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(previewText)}</title></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f9fafb;padding:32px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
       style="max-width:520px;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px 36px">
<tr><td>
<p style="margin:0 0 28px;font-size:18px;font-weight:700;color:#4f46e5">BookingAgent</p>
${body}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 20px"/>
<p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">You're receiving this because a booking was made through BookingAgent. If this wasn't you, you can safely ignore this email.</p>
</td></tr></table>
</td></tr></table></body></html>`;
}

function bookingDetailsBlock(d: BookingEmailData): string {
  const tz = d.timezone || "UTC";
  const dateStr  = d.startsAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: tz });
  const startStr = d.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const endStr   = d.endsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
  ${infoRow("Service", esc(d.serviceName))}
  ${infoRow("Staff",   esc(d.staffName))}
  ${infoRow("Date",    esc(dateStr))}
  ${infoRow("Time",    `${esc(startStr)} – ${esc(endStr)}`)}
</table>
<p style="margin:0;font-size:12px;color:#9ca3af">Booking ref: <code>${esc(d.bookingId.slice(0, 8).toUpperCase())}</code></p>`;
}

// ─── Confirmation ─────────────────────────────────────────────────────────────

export async function sendBookingConfirmation(d: BookingEmailData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping confirmation email");
    return;
  }
  try {
    const base      = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const cancelUrl = `${base}/book/cancel/${esc(d.bookingId)}`;
    const body = `
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Your booking is confirmed ✓</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280">Hi ${esc(d.customerName)}, your appointment at <strong>${esc(d.businessName)}</strong> is confirmed.</p>
${bookingDetailsBlock(d)}
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Need to cancel? <a href="${cancelUrl}" style="color:#4f46e5">Cancel appointment</a></p>`;
    const { error } = await client.emails.send({
      from:    FROM_EMAIL,
      to:      d.customerEmail,
      subject: `Booking confirmed at ${d.businessName}`,
      html:    layout(body, `Booking confirmed at ${d.businessName}`),
    });
    if (error) console.error("[email] Resend error (confirmation):", error);
  } catch (err) {
    console.error("[email] Failed to send confirmation:", err);
  }
}

// ─── Reminder ─────────────────────────────────────────────────────────────────

export async function sendBookingReminder(
  d: BookingEmailData & { minutesBefore: number }
): Promise<void> {
  const client = getResend();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping reminder email");
    return;
  }
  try {
    const hours = Math.round(d.minutesBefore / 60);
    const timeLabel = hours >= 24 ? "tomorrow" : hours > 1 ? `in ${hours} hours` : "soon";
    const body = `
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">⏰ Reminder: Your appointment is ${esc(timeLabel)}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280">Hi ${esc(d.customerName)}, a friendly reminder about your upcoming appointment at <strong>${esc(d.businessName)}</strong>.</p>
${bookingDetailsBlock(d)}`;
    const { error } = await client.emails.send({
      from:    FROM_EMAIL,
      to:      d.customerEmail,
      subject: `Reminder: Your appointment at ${d.businessName} is ${timeLabel}`,
      html:    layout(body, `Reminder: Your appointment at ${d.businessName}`),
    });
    if (error) console.error("[email] Resend error (reminder):", error);
  } catch (err) {
    console.error("[email] Failed to send reminder:", err);
  }
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function sendBookingCancellation(
  d: BookingEmailData & { reason?: string }
): Promise<void> {
  const client = getResend();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping cancellation email");
    return;
  }
  try {
    const reasonBlock = d.reason
      ? `<p style="margin:12px 0 0;font-size:14px;color:#6b7280">Reason: ${esc(d.reason)}</p>`
      : "";
    const body = `
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Your booking has been cancelled</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280">Hi ${esc(d.customerName)}, your appointment at <strong>${esc(d.businessName)}</strong> has been cancelled.</p>
${bookingDetailsBlock(d)}
${reasonBlock}`;
    const { error } = await client.emails.send({
      from:    FROM_EMAIL,
      to:      d.customerEmail,
      subject: `Your booking at ${d.businessName} has been cancelled`,
      html:    layout(body, `Booking cancelled at ${d.businessName}`),
    });
    if (error) console.error("[email] Resend error (cancellation):", error);
  } catch (err) {
    console.error("[email] Failed to send cancellation:", err);
  }
}

// ─── Password reset ───────────────────────────────────────────────────────────

export interface PasswordResetEmailData {
  email:    string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(d: PasswordResetEmailData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping password reset email");
    return;
  }
  try {
    const body = `
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">Reset your password</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280">We received a request to reset the password for your BookingAgent account. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
<a href="${esc(d.resetUrl)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Reset password</a>
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Or copy this link: <a href="${esc(d.resetUrl)}" style="color:#4f46e5">${esc(d.resetUrl)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#9ca3af">If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>`;
    const { error } = await client.emails.send({
      from:    FROM_EMAIL,
      to:      d.email,
      subject: "Reset your BookingAgent password",
      html:    layout(body, "Reset your BookingAgent password"),
    });
    if (error) console.error("[email] Resend error (password-reset):", error);
  } catch (err) {
    console.error("[email] Failed to send password reset email:", err);
  }
}

// ─── Invite ───────────────────────────────────────────────────────────────────

export interface InviteEmailData {
  email:         string;
  tenantName:    string;
  inviteUrl:     string;
  role:          string;
  inviterEmail?: string;
}

export async function sendInviteEmail(d: InviteEmailData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.log("[email] RESEND_API_KEY not set — skipping invite email");
    return;
  }
  try {
    const who = d.inviterEmail
      ? `<strong>${esc(d.inviterEmail)}</strong> has invited you`
      : "You've been invited";
    const body = `
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">You're invited to join ${esc(d.tenantName)} 🎉</h1>
<p style="margin:0 0 24px;font-size:14px;color:#6b7280">${who} to join <strong>${esc(d.tenantName)}</strong> as <strong>${esc(d.role)}</strong>. This invitation expires in 7 days.</p>
<a href="${esc(d.inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">Accept invitation</a>
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Or copy this link: <a href="${esc(d.inviteUrl)}" style="color:#4f46e5">${esc(d.inviteUrl)}</a></p>`;
    const { error } = await client.emails.send({
      from:    FROM_EMAIL,
      to:      d.email,
      subject: `You've been invited to join ${d.tenantName} on BookingAgent`,
      html:    layout(body, `You're invited to join ${d.tenantName}`),
    });
    if (error) console.error("[email] Resend error (invite):", error);
  } catch (err) {
    console.error("[email] Failed to send invite:", err);
  }
}
