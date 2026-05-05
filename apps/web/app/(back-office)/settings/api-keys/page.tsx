"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

// Keep in sync with packages/trpc/src/routers/tenant.ts
const SERVICES = [
  {
    key: "anthropic",
    label: "Anthropic (Claude AI)",
    description: "Powers the AI booking agent to handle customer conversations automatically.",
    hint: "sk-ant-...",
    group: "AI",
  },
  {
    key: "openai",
    label: "OpenAI (GPT)",
    description: "Alternative AI provider for the booking agent.",
    hint: "sk-...",
    group: "AI",
  },
  {
    key: "sendgrid",
    label: "SendGrid",
    description: "Send booking confirmations, reminders, and cancellation emails.",
    hint: "SG....",
    group: "Email",
  },
  {
    key: "twilio_sid",
    label: "Twilio Account SID",
    description: "Required for WhatsApp messaging via Twilio and SMS reminders.",
    hint: "AC...",
    group: "SMS / WhatsApp",
  },
  {
    key: "twilio_auth",
    label: "Twilio Auth Token",
    description: "Paired with your Twilio Account SID.",
    hint: "",
    group: "SMS / WhatsApp",
  },
  {
    key: "stripe_secret",
    label: "Stripe Secret Key",
    description: "Process payments for paid bookings (server-side).",
    hint: "sk_live_... or sk_test_...",
    group: "Payments",
  },
  {
    key: "stripe_public",
    label: "Stripe Publishable Key",
    description: "Shown to the booking site frontend for Stripe Elements.",
    hint: "pk_live_... or pk_test_...",
    group: "Payments",
  },
] as const;

const GROUP_ORDER = ["AI", "Email", "SMS / WhatsApp", "Payments"] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono";

// ─── Individual row ───────────────────────────────────────────────────────────

function ApiKeyRow({
  service,
  label,
  description,
  hint,
  configured,
  masked,
  updatedAt,
}: {
  service: ServiceKey;
  label: string;
  description: string;
  hint: string;
  configured: boolean;
  masked?: string;
  updatedAt?: Date | string;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const saveMutation = trpc.tenant.setApiKey.useMutation({
    onSuccess: () => {
      utils.tenant.listApiKeys.invalidate();
      setEditing(false);
      setValue("");
    },
  });
  const deleteMutation = trpc.tenant.deleteApiKey.useMutation({
    onSuccess: () => utils.tenant.listApiKeys.invalidate(),
  });

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            {configured ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                configured
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400">
                not set
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          {configured && masked && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              {masked}
              {updatedAt && (
                <> · Updated {new Date(updatedAt).toLocaleDateString()}</>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setEditing((v) => !v);
              setValue("");
            }}
            className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
          >
            {editing ? "Cancel" : configured ? "Update" : "Add"}
          </button>
          {configured && !editing && (
            <button
              onClick={() => {
                if (confirm(`Remove ${label}? Services using it will stop working.`)) {
                  deleteMutation.mutate({ service });
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={hint || `Enter ${label}`}
            className={inputCls}
          />
          <button
            disabled={!value.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ service, value: value.trim() })}
            className="shrink-0 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium rounded-md"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
          {saveMutation.isError && (
            <span className="text-xs text-red-600 self-center">
              {saveMutation.error.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const { data: keys, isLoading } = trpc.tenant.listApiKeys.useQuery();

  const keyMap = Object.fromEntries((keys ?? []).map((k) => [k.service, k]));

  const grouped = GROUP_ORDER.map((group) => ({
    group,
    services: SERVICES.filter((s) => s.group === group),
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure third-party service credentials for your workspace.
          Keys are stored AES-256-GCM encrypted and never shown in full.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 px-5 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ group, services }) => (
            <div key={group} className="bg-white rounded-xl border border-gray-200 px-5 py-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider py-3 border-b border-gray-100">
                {group}
              </h2>
              {services.map((s) => (
                <ApiKeyRow
                  key={s.key}
                  service={s.key}
                  label={s.label}
                  description={s.description}
                  hint={s.hint}
                  configured={!!keyMap[s.key]}
                  masked={keyMap[s.key]?.masked}
                  updatedAt={keyMap[s.key]?.updatedAt}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <p className="text-xs font-semibold text-amber-800 mb-1">Security note</p>
        <p className="text-xs text-amber-700">
          API keys are encrypted at rest using AES-256-GCM. Only owners and
          admins can view, update, or remove keys. The full key value is never
          sent to the browser — only the last 4 characters are shown for
          verification.
        </p>
      </div>
    </div>
  );
}
