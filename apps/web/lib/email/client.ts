/**
 * Resend email client singleton.
 * Reads RESEND_API_KEY from env; if missing, logs a warning and no-ops in dev.
 */
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("RESEND_API_KEY is not set. Email sending will not work.");
}

export const resend = new Resend(apiKey ?? "re_placeholder");

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "BookingAgent <noreply@bookingagent.app>";
