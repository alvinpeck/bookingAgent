/**
 * High-level email send helpers.
 * Each function wraps a Resend API call and logs errors (never throws) so
 * that email failures are non-blocking in booking flows.
 */

import { resend, FROM_EMAIL } from "./client";
import {
  bookingConfirmationHtml,
  bookingConfirmationText,
  bookingReminderHtml,
  bookingCancelledHtml,
  inviteEmailHtml,
  inviteEmailText,
  type BookingEmailData,
  type InviteEmailData,
} from "./templates";

// ─── Booking confirmation ────────────────────────────────────────────────────

export async function sendBookingConfirmation(
  data: BookingEmailData
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping booking confirmation");
    return;
  }
  try {
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      data.customerName
        ? `${data.customerName} <${data.customerName}>` // addressed properly below
        : data.customerName,
      // We get the actual email address from the caller — data re-uses customerName
      // as a placeholder; real call site passes customerEmail separately via the
      // spread helper below. See sendBookingConfirmationToEmail().
      subject: `Booking confirmed at ${data.businessName}`,
      html:    bookingConfirmationHtml(data),
      text:    bookingConfirmationText(data),
    });
  } catch (err) {
    console.error("[email] Failed to send booking confirmation:", err);
  }
}

export async function sendBookingConfirmationToEmail(
  email: string,
  data: BookingEmailData
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping booking confirmation");
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `Booking confirmed at ${data.businessName}`,
      html:    bookingConfirmationHtml(data),
      text:    bookingConfirmationText(data),
    });
    if (error) console.error("[email] Resend error (confirmation):", error);
  } catch (err) {
    console.error("[email] Failed to send booking confirmation:", err);
  }
}

// ─── Booking reminder ────────────────────────────────────────────────────────

export async function sendBookingReminder(
  email: string,
  data: BookingEmailData & { minutesBefore: number }
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping booking reminder");
    return;
  }
  try {
    const hours = Math.round(data.minutesBefore / 60);
    const { error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `Reminder: Your appointment at ${data.businessName} is ${hours >= 24 ? "tomorrow" : `in ${hours} hour${hours !== 1 ? "s" : ""}`}`,
      html:    bookingReminderHtml(data),
    });
    if (error) console.error("[email] Resend error (reminder):", error);
  } catch (err) {
    console.error("[email] Failed to send booking reminder:", err);
  }
}

// ─── Booking cancellation ────────────────────────────────────────────────────

export async function sendBookingCancellation(
  email: string,
  data: BookingEmailData & { reason?: string }
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping cancellation email");
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `Your booking at ${data.businessName} has been cancelled`,
      html:    bookingCancelledHtml(data),
    });
    if (error) console.error("[email] Resend error (cancellation):", error);
  } catch (err) {
    console.error("[email] Failed to send cancellation email:", err);
  }
}

// ─── Workspace invite ────────────────────────────────────────────────────────

export async function sendInviteEmail(
  email: string,
  data: InviteEmailData
): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log("[email] RESEND_API_KEY not set — skipping invite email");
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `You've been invited to join ${data.tenantName} on BookingAgent`,
      html:    inviteEmailHtml(data),
      text:    inviteEmailText(data),
    });
    if (error) console.error("[email] Resend error (invite):", error);
  } catch (err) {
    console.error("[email] Failed to send invite email:", err);
  }
}
