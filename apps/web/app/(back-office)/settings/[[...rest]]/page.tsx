"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

type Tab = "general" | "team" | "compliance" | "payments";

const inputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";

// ─── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700",
  admin:    "bg-blue-100 text-blue-700",
  staff:    "bg-green-100 text-green-700",
  readonly: "bg-gray-100 text-gray-600",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_BADGE[role] ?? ROLE_BADGE["readonly"]!}`}>
      {role}
    </span>
  );
}

// ─── General / Workspace profile section ─────────────────────────────────────

function GeneralSection() {
  const utils = trpc.useUtils();
  const { data: tenant, isLoading } = trpc.tenant.getCurrent.useQuery();

  const [name,          setName]          = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [timezone,      setTimezone]      = useState("");
  const [websiteUrl,    setWebsiteUrl]    = useState("");
  const [saved,         setSaved]         = useState("");

  const updateMutation = trpc.tenant.updateProfile.useMutation({
    onSuccess: () => {
      utils.tenant.getCurrent.invalidate();
      setSaved("Saved!");
      setTimeout(() => setSaved(""), 3000);
    },
    onError: (err) => setSaved(`Error: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  const t = tenant;

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, string> = {};
    if (name          && name          !== t?.name)          patch.name          = name;
    if (businessEmail && businessEmail !== t?.businessEmail) patch.businessEmail = businessEmail;
    if (businessPhone && businessPhone !== t?.businessPhone) patch.businessPhone = businessPhone;
    if (timezone      && timezone      !== t?.timezone)      patch.timezone      = timezone;
    if (websiteUrl    && websiteUrl    !== t?.websiteUrl)    patch.websiteUrl    = websiteUrl;
    if (Object.keys(patch).length === 0) { setSaved("No changes."); setTimeout(() => setSaved(""), 2000); return; }
    updateMutation.mutate(patch as any);
  }

  return (
    <form onSubmit={handleSave} className="rounded-xl border border-gray-200 divide-y divide-gray-100">
      <div className="px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">Workspace details</h3>
        <p className="text-sm text-gray-500 mt-0.5">Shown on your public booking page and in confirmation emails.</p>
      </div>

      <div className="px-6 py-4 grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Business name</label>
          <input
            className={inputCls}
            defaultValue={t?.name ?? ""}
            onChange={(e) => setName(e.target.value)}
            placeholder={t?.name ?? "Acme Hair Studio"}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
          <input
            className={inputCls}
            defaultValue={t?.websiteUrl ?? ""}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
            type="url"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Business email</label>
          <input
            className={inputCls}
            defaultValue={t?.businessEmail ?? ""}
            onChange={(e) => setBusinessEmail(e.target.value)}
            placeholder="hello@example.com"
            type="email"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Business phone</label>
          <input
            className={inputCls}
            defaultValue={t?.businessPhone ?? ""}
            onChange={(e) => setBusinessPhone(e.target.value)}
            placeholder="+1 555 000 0000"
            type="tel"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Timezone</label>
          <select
            className={inputCls}
            defaultValue={t?.timezone ?? "UTC"}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {[
              { group: "UTC", zones: ["UTC"] },
              { group: "Europe", zones: [
                "Europe/London","Europe/Dublin","Europe/Lisbon",
                "Europe/Paris","Europe/Amsterdam","Europe/Brussels","Europe/Berlin",
                "Europe/Rome","Europe/Madrid","Europe/Zurich","Europe/Vienna",
                "Europe/Stockholm","Europe/Copenhagen","Europe/Oslo","Europe/Helsinki",
                "Europe/Warsaw","Europe/Prague","Europe/Budapest","Europe/Bucharest",
                "Europe/Athens","Europe/Istanbul","Europe/Kiev","Europe/Moscow",
              ]},
              { group: "Americas", zones: [
                "America/New_York","America/Detroit","America/Indiana/Indianapolis",
                "America/Chicago","America/Winnipeg","America/Denver","America/Phoenix",
                "America/Los_Angeles","America/Anchorage","America/Adak",
                "Pacific/Honolulu",
                "America/Toronto","America/Vancouver","America/Halifax",
                "America/St_Johns","America/Mexico_City","America/Monterrey",
                "America/Bogota","America/Lima","America/Santiago","America/Caracas",
                "America/La_Paz","America/Buenos_Aires","America/Sao_Paulo",
              ]},
              { group: "Africa", zones: [
                "Africa/Abidjan","Africa/Lagos","Africa/Cairo","Africa/Nairobi",
                "Africa/Johannesburg","Africa/Casablanca","Africa/Accra",
                "Africa/Addis_Ababa","Africa/Dar_es_Salaam","Africa/Khartoum",
              ]},
              { group: "Middle East", zones: [
                "Asia/Dubai","Asia/Riyadh","Asia/Qatar","Asia/Kuwait",
                "Asia/Bahrain","Asia/Muscat","Asia/Aden","Asia/Tehran",
                "Asia/Jerusalem","Asia/Amman","Asia/Beirut","Asia/Baghdad",
              ]},
              { group: "Asia", zones: [
                "Asia/Karachi","Asia/Kolkata","Asia/Colombo","Asia/Dhaka",
                "Asia/Kathmandu","Asia/Rangoon","Asia/Bangkok","Asia/Jakarta",
                "Asia/Ho_Chi_Minh","Asia/Phnom_Penh","Asia/Singapore","Asia/Kuala_Lumpur",
                "Asia/Manila","Asia/Hong_Kong","Asia/Shanghai","Asia/Taipei",
                "Asia/Seoul","Asia/Tokyo","Asia/Ulaanbaatar","Asia/Almaty","Asia/Tashkent",
              ]},
              { group: "Australia & Pacific", zones: [
                "Australia/Perth","Australia/Darwin","Australia/Adelaide",
                "Australia/Brisbane","Australia/Sydney","Australia/Melbourne",
                "Australia/Hobart","Pacific/Auckland","Pacific/Fiji",
                "Pacific/Guam","Pacific/Honolulu","Pacific/Tahiti",
              ]},
            ].map(({ group, zones }) => (
              <optgroup key={group} label={group}>
                {zones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{saved || " "}</p>
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// ─── Team section ─────────────────────────────────────────────────────────────

function TeamSection() {
  const utils = trpc.useUtils();
  const { data: members,  isLoading: membersLoading  } = trpc.tenant.listMembers.useQuery();
  const { data: invites,  isLoading: invitesLoading  } = trpc.tenant.listPendingInvites.useQuery();
  const { data: self }                                  = trpc.tenant.getCurrent.useQuery();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState<"admin" | "staff" | "readonly">("staff");
  const [inviteMsg,   setInviteMsg]   = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [inviteLink,  setInviteLink]  = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const inviteMutation = trpc.tenant.inviteMember.useMutation({
    onSuccess: (data) => {
      utils.tenant.listPendingInvites.invalidate();
      setInviteLink(data.inviteUrl);
      setInviteMsg({ type: "success", text: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
    },
    onError: (err) => setInviteMsg({ type: "error", text: err.message }),
  });

  const revokeMutation = trpc.tenant.revokeInvite.useMutation({
    onSuccess: () => utils.tenant.listPendingInvites.invalidate(),
  });

  const roleChangeMutation = trpc.tenant.updateMemberRole.useMutation({
    onSuccess: () => { utils.tenant.listMembers.invalidate(); setChangingRole(null); },
    onError: (err) => alert(err.message),
  });

  const removeMutation = trpc.tenant.removeMember.useMutation({
    onSuccess: () => utils.tenant.listMembers.invalidate(),
    onError: (err) => alert(err.message),
  });

  return (
    <div className="space-y-8">
      {/* Members list */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Team members</h3>
          <p className="text-sm text-gray-500 mt-0.5">People who have access to this workspace.</p>
        </div>

        {membersLoading ? (
          <div className="divide-y divide-gray-100">
            {[1, 2].map((i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-gray-100 rounded w-40" />
                  <div className="h-3 bg-gray-100 rounded w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(members ?? []).map((m) => {
              const displayName = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
              const isMe = m.id === (self as any)?.id; // same tenantUser id
              return (
                <div key={m.id} className="px-6 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                  </div>

                  {/* Role selector (admin/owner only) */}
                  {changingRole === m.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue={m.role}
                        onChange={(e) => {
                          roleChangeMutation.mutate({
                            tenantUserId: m.id,
                            role: e.target.value as any,
                          });
                        }}
                        className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="readonly">Read-only</option>
                      </select>
                      <button onClick={() => setChangingRole(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => !isMe && setChangingRole(m.id)} disabled={isMe} className="disabled:cursor-default">
                      <RoleBadge role={m.role} />
                    </button>
                  )}

                  {/* Remove */}
                  {!isMe && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${displayName} from this workspace?`)) {
                          removeMutation.mutate({ tenantUserId: m.id });
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 ml-1"
                    >
                      Remove
                    </button>
                  )}
                  {isMe && <span className="text-xs text-gray-400 ml-1">You</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invite form */}
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Invite a team member</h3>
          <p className="text-sm text-gray-500 mt-0.5">They&apos;ll receive an email with a link to join. Invite expires in 7 days.</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-52">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteMsg(null); setInviteLink(null); }}
                placeholder="colleague@example.com"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="readonly">Read-only</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!inviteEmail) return;
                inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
              }}
              disabled={inviteMutation.isPending || !inviteEmail}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {inviteMutation.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>

          {inviteMsg && (
            <p className={`text-xs mt-3 ${inviteMsg.type === "error" ? "text-red-600" : "text-green-700"}`}>
              {inviteMsg.text}
            </p>
          )}

          {/* Copy link fallback */}
          {inviteLink && (
            <div className="mt-3 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500 flex-1 truncate">{inviteLink}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(inviteLink); }}
                className="text-xs text-indigo-600 hover:underline shrink-0"
              >
                Copy link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {!invitesLoading && (invites ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Pending invites</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {(invites ?? []).map((inv) => (
              <div key={inv.id} className="px-6 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{inv.email ?? "Generic link"}</p>
                  <p className="text-xs text-gray-400">
                    Expires {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" · "}<RoleBadge role={inv.role} />
                  </p>
                </div>
                <button
                  onClick={() => revokeMutation.mutate({ inviteId: inv.id })}
                  disabled={revokeMutation.isPending}
                  className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compliance section (existing) ────────────────────────────────────────────

function ComplianceSection() {
  const { data: settings, isLoading, refetch } = trpc.compliance.getRetentionSettings.useQuery();

  const updateMutation = trpc.compliance.updateRetentionSettings.useMutation({
    onSuccess: () => {
      refetch();
      setSaveMessage("Settings saved.");
      setTimeout(() => setSaveMessage(""), 3000);
    },
    onError: (err) => setSaveMessage(`Error: ${err.message}`),
  });

  const erasureMutation = trpc.compliance.requestErasure.useMutation({
    onSuccess: () => {
      setErasureUserId("");
      setErasureReason("");
      setErasureMessage("Erasure request completed.");
      setTimeout(() => setErasureMessage(""), 4000);
    },
    onError: (err) => setErasureMessage(`Error: ${err.message}`),
  });

  const [conversations,     setConversations]     = useState<number | "">("");
  const [webhookEvents,     setWebhookEvents]     = useState<number | "">("");
  const [retentionBookings, setRetentionBookings] = useState<number | "">("");
  const [saveMessage,       setSaveMessage]       = useState("");
  const [erasureUserId,     setErasureUserId]     = useState("");
  const [erasureReason,     setErasureReason]     = useState("");
  const [erasureMessage,    setErasureMessage]    = useState("");
  const [erasureConfirmPending, setErasureConfirmPending] = useState(false);

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-gray-200 p-6">
        <div className="h-4 bg-gray-100 rounded w-48 mb-3" />
        <div className="h-4 bg-gray-100 rounded w-64" />
      </div>
    );
  }

  const current = settings ?? { conversations: 90, webhookEvents: 30, bookings: 365 };

  function handleSave() {
    const patch: { conversations?: number; webhookEvents?: number; bookings?: number } = {};
    if (conversations     !== "" && conversations     !== current.conversations) patch.conversations = conversations as number;
    if (webhookEvents     !== "" && webhookEvents     !== current.webhookEvents) patch.webhookEvents = webhookEvents as number;
    if (retentionBookings !== "" && retentionBookings !== current.bookings)      patch.bookings      = retentionBookings as number;
    if (!Object.keys(patch).length) { setSaveMessage("No changes to save."); setTimeout(() => setSaveMessage(""), 2000); return; }
    updateMutation.mutate(patch);
  }

  function handleErasureSubmit() {
    if (!erasureUserId.trim()) return;
    if (!erasureConfirmPending) { setErasureConfirmPending(true); return; }
    setErasureConfirmPending(false);
    erasureMutation.mutate({ externalUserId: erasureUserId.trim(), reason: erasureReason.trim() || undefined });
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Retention Periods</h3>
          <p className="text-sm text-gray-500 mt-1">Data older than these thresholds is deleted by the nightly retention job.</p>
        </div>
        {[
          { label: "Conversation history", key: "conversations", min: 7, max: 730, val: conversations, set: setConversations, current: current.conversations },
          { label: "Webhook event payloads", key: "webhookEvents", min: 7, max: 90, val: webhookEvents, set: setWebhookEvents, current: current.webhookEvents },
          { label: "Booking records", key: "bookings", min: 90, max: 2555, val: retentionBookings, set: setRetentionBookings, current: current.bookings },
        ].map((row) => (
          <div key={row.key} className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-800">{row.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Current: <span className="font-semibold">{row.current} days</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={row.min} max={row.max}
                placeholder={String(row.current)} value={row.val}
                onChange={(e) => row.set(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-400">days</span>
            </div>
          </div>
        ))}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">{saveMessage || " "}</p>
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {updateMutation.isPending ? "Saving…" : "Save retention settings"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-red-100 bg-red-50 divide-y divide-red-100">
        <div className="px-6 py-4">
          <h3 className="text-base font-semibold text-red-800">Request User Erasure</h3>
          <p className="text-sm text-red-700 mt-1">
            Permanently deletes all conversation history for the specified external user ID. This cannot be undone.
          </p>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">External user ID *</label>
            <input type="text" placeholder="e.g. 447911123456 or telegram:12345678"
              value={erasureUserId}
              onChange={(e) => { setErasureUserId(e.target.value); setErasureConfirmPending(false); }}
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <input type="text" placeholder="e.g. GDPR erasure request via email"
              value={erasureReason} onChange={(e) => setErasureReason(e.target.value)}
              className="w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          {erasureMessage && <p className="text-sm font-medium text-red-700">{erasureMessage}</p>}
          <div className="flex items-center gap-3">
            <button onClick={handleErasureSubmit}
              disabled={!erasureUserId.trim() || erasureMutation.isPending}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${erasureConfirmPending ? "bg-red-700 hover:bg-red-800" : "bg-red-600 hover:bg-red-700"}`}>
              {erasureMutation.isPending ? "Processing…" : erasureConfirmPending ? "Confirm — irreversible" : "Request erasure"}
            </button>
            {erasureConfirmPending && (
              <button onClick={() => setErasureConfirmPending(false)} className="text-sm text-gray-500 hover:text-gray-700 underline">Cancel</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payments section ─────────────────────────────────────────────────────────

function PaymentsSection() {
  const utils = trpc.useUtils();
  const { data: status, isLoading } = trpc.tenant.getConnectStatus.useQuery();

  const onboardMutation = trpc.tenant.createConnectOnboardingLink.useMutation({
    onSuccess: ({ url }) => { window.location.href = url; },
  });
  const disconnectMutation = trpc.tenant.disconnectStripeConnect.useMutation({
    onSuccess: () => utils.tenant.getConnectStatus.invalidate(),
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-4 w-40 bg-gray-100 rounded mb-3" />
        <div className="h-4 w-64 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Stripe Connect</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
              Connect your Stripe account so customers can pay at the time of booking.
              Payments go directly to you — your platform subscription covers the service fee.
            </p>
          </div>

          {status?.connected ? (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              status.chargesEnabled
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.chargesEnabled ? "bg-green-500" : "bg-yellow-500"}`} />
              {status.chargesEnabled ? "Active" : "Pending verification"}
            </span>
          ) : null}
        </div>

        <div className="mt-5">
          {!status?.connected ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onboardMutation.mutate()}
                disabled={onboardMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {onboardMutation.isPending ? "Redirecting…" : "Connect Stripe account"}
              </button>
              {onboardMutation.isError && (
                <span className="text-sm text-red-600">{onboardMutation.error.message}</span>
              )}
            </div>
          ) : !status.onboardingComplete ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                Your Stripe setup is incomplete. Finish it to start accepting payments.
              </p>
              <button
                onClick={() => onboardMutation.mutate()}
                disabled={onboardMutation.isPending}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-300 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
              >
                {onboardMutation.isPending ? "Redirecting…" : "Complete setup"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-xs text-sm">
                <span className="text-gray-500">Account ID</span>
                <span className="font-mono text-gray-700 text-xs">{status.accountId}</span>
                <span className="text-gray-500">Charges</span>
                <span className={status.chargesEnabled ? "text-green-600 font-medium" : "text-yellow-600"}>
                  {status.chargesEnabled ? "Enabled" : "Pending"}
                </span>
                <span className="text-gray-500">Payouts</span>
                <span className={status.payoutsEnabled ? "text-green-600 font-medium" : "text-yellow-600"}>
                  {status.payoutsEnabled ? "Enabled" : "Pending"}
                </span>
              </div>
              <button
                onClick={() => {
                  if (!confirm("Disconnect Stripe? Customers will no longer be able to pay at booking.")) return;
                  disconnectMutation.mutate();
                }}
                disabled={disconnectMutation.isPending}
                className="mt-2 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect Stripe"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Enabling payments per service</h2>
        <p className="text-xs text-gray-500">
          Once connected, go to <strong>Services</strong> and toggle &ldquo;Require payment at booking&rdquo; on any
          service. Customers will be sent to Stripe Checkout before their booking is confirmed.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get("tab") === "payments" ? "payments" : "general"
  );

  // Auto-open payments tab when Stripe redirects back
  useEffect(() => {
    if (searchParams.get("tab") === "payments") setTab("payments");
  }, [searchParams]);

  const TABS: { id: Tab; label: string }[] = [
    { id: "general",    label: "General" },
    { id: "team",       label: "Team" },
    { id: "compliance", label: "Compliance" },
    { id: "payments",   label: "Payments" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Manage your workspace profile, team members, and compliance settings.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`pb-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <Link
          href="/settings/profile"
          className="pb-2.5 text-xs text-indigo-600 hover:underline self-center"
        >
          My profile →
        </Link>
      </div>

      {/* Tab content */}
      {tab === "general"    && <GeneralSection />}
      {tab === "team"       && <TeamSection />}
      {tab === "compliance" && <ComplianceSection />}
      {tab === "payments"   && <PaymentsSection />}
    </div>
  );
}
