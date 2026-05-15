/**
 * Plain-HTML email templates for BookingAgent transactional emails.
 * Simple template strings — no JSX — so they work in API routes and tRPC procedures.
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function infoRow(label: string, value: string): string {
  return `
  <tr>
    <td style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;
               letter-spacing:.04em;padding:4px 0;width:80px;vertical-align:top">
      ${label}
    </td>
    <td style="font-size:14px;color:#111827;padding:4px 0 4px 12px">${value}</td>
  </tr>`;
}

function layout(bodyHtml: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${esc(previewText)}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="max-width:520px;background:#ffffff;border-radius:12px;
                    border:1px solid #e5e7eb;padding:40px 36px">
        <tr><td>
          <p style="margin:0 0 28px;font-size:18px;font-weight:700;color:#4f46e5">
            BookingAgent
          </p>
          ${bodyHtml}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 20px"/>
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">
            You're receiving this because a booking was made through BookingAgent.
            If this wasn't you, you can safely ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Booking confirmation ────────────────────────────────────────────────────

export interface BookingEmailData {
  customerName:  string;
  businessName:  string;
  serviceName:   string;
  staffName:     string;
  startsAt:      Date;
  endsAt:        Date;
  timezone:      string;
  bookingId:     string;
}

function bookingDetailsRows(d: BookingEmailData): string {
  const dateStr  = d.startsAt.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: d.timezone,
  });
  const startStr = d.startsAt.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: d.timezone,
  });
  const endStr   = d.endsAt.toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: d.timezone,
  });
  return (
    infoRow("Service", esc(d.serviceName)) +
    infoRow("Staff",   esc(d.staffName)) +
    infoRow("Date",    esc(dateStr)) +
    infoRow("Time",    `${esc(startStr)} – ${esc(endStr)}`)
  );
}

export function bookingConfirmationHtml(d: BookingEmailData): string {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">
      Your booking is confirmed ✓
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
      Hi ${esc(d.customerName)}, your appointment at
      <strong>${esc(d.businessName)}</strong> is confirmed.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      ${bookingDetailsRows(d)}
    </table>
    <p style="margin:0;font-size:12px;color:#9ca3af">
      Booking ref: <code>${esc(d.bookingId.slice(0, 8).toUpperCase())}</code>
    </p>`;
  return layout(body, `Booking confirmed at ${d.businessName}`);
}

export function bookingConfirmationText(d: BookingEmailData): string {
  const dateStr = d.startsAt.toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: d.timezone,
  });
  return [
    `Your booking at ${d.businessName} is confirmed.`,
    `Service: ${d.serviceName}`,
    `Staff: ${d.staffName}`,
    `When: ${dateStr}`,
    `Booking ref: ${d.bookingId.slice(0, 8).toUpperCase()}`,
  ].join("\n");
}

// ─── Booking reminder ────────────────────────────────────────────────────────

export function bookingReminderHtml(d: BookingEmailData & { minutesBefore: number }): string {
  const hours = Math.round(d.minutesBefore / 60);
  const timeLabel = hours >= 24
    ? `tomorrow`
    : hours > 1 ? `in ${hours} hours` : "soon";

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">
      ⏰ Reminder: Your appointment is ${esc(timeLabel)}
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
      Hi ${esc(d.customerName)}, just a reminder about your upcoming appointment
      at <strong>${esc(d.businessName)}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      ${bookingDetailsRows(d)}
    </table>
    <p style="margin:0;font-size:12px;color:#9ca3af">
      Booking ref: <code>${esc(d.bookingId.slice(0, 8).toUpperCase())}</code>
    </p>`;
  return layout(body, `Reminder: Your appointment at ${d.businessName}`);
}

// ─── Booking cancelled ───────────────────────────────────────────────────────

export function bookingCancelledHtml(d: BookingEmailData & { reason?: string }): string {
  const reasonHtml = d.reason
    ? `<p style="margin:12px 0 0;font-size:14px;color:#6b7280">Reason: ${esc(d.reason)}</p>`
    : "";

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">
      Your booking has been cancelled
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
      Hi ${esc(d.customerName)}, your appointment at
      <strong>${esc(d.businessName)}</strong> has been cancelled.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      ${bookingDetailsRows(d)}
    </table>
    ${reasonHtml}
    <p style="margin:12px 0 0;font-size:12px;color:#9ca3af">
      Booking ref: <code>${esc(d.bookingId.slice(0, 8).toUpperCase())}</code>
    </p>`;
  return layout(body, `Booking cancelled at ${d.businessName}`);
}

// ─── Workspace invite ────────────────────────────────────────────────────────

export interface InviteEmailData {
  tenantName:    string;
  inviteUrl:     string;
  role:          string;
  inviterEmail?: string;
}

export function inviteEmailHtml(d: InviteEmailData): string {
  const who = d.inviterEmail
    ? `<strong>${esc(d.inviterEmail)}</strong> has invited you`
    : "You've been invited";

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827">
      You're invited to join ${esc(d.tenantName)} 🎉
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
      ${who} to join <strong>${esc(d.tenantName)}</strong> as
      <strong>${esc(d.role)}</strong>. This invitation expires in 7 days.
    </p>
    <a href="${esc(d.inviteUrl)}"
       style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#ffffff;
              text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
      Accept invitation
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
      Or paste this link into your browser:
      <a href="${esc(d.inviteUrl)}" style="color:#4f46e5">${esc(d.inviteUrl)}</a>
    </p>`;
  return layout(body, `You're invited to join ${d.tenantName}`);
}

export function inviteEmailText(d: InviteEmailData): string {
  const who = d.inviterEmail ? `${d.inviterEmail} has invited you` : "You've been invited";
  return [
    `${who} to join ${d.tenantName} as ${d.role}.`,
    `Accept your invitation (expires in 7 days): ${d.inviteUrl}`,
  ].join("\n\n");
}
