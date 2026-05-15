"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

// Keep in sync with packages/trpc/src/routers/tenant.ts
const SERVICES = [
  // ── Paid AI ───────────────────────────────────────────────────────────────
  {
    key:         "anthropic",
    label:       "Anthropic (Claude AI)",
    description: "Paid — Powers the booking agent with Claude Haiku. Best accuracy for complex bookings.",
    hint:        "sk-ant-...",
    group:       "AI Agent",
    badge:       null,
    docsUrl:     "https://console.anthropic.com/settings/keys",
  },
  {
    key:         "openai",
    label:       "OpenAI (GPT-4o mini)",
    description: "Paid — Alternative AI provider using GPT-4o mini.",
    hint:        "sk-...",
    group:       "AI Agent",
    badge:       null,
    docsUrl:     "https://platform.openai.com/api-keys",
  },
  // ── Free AI ───────────────────────────────────────────────────────────────
  {
    key:         "groq",
    label:       "Groq (Llama 3.3 70B)",
    description: "Free tier — ~14 400 requests/day. Fast inference, reliable tool-calling. Recommended free option.",
    hint:        "gsk_...",
    group:       "AI Agent",
    badge:       "FREE",
    docsUrl:     "https://console.groq.com/keys",
  },
  {
    key:         "gemini",
    label:       "Google Gemini (Flash 1.5)",
    description: "Free tier — 1 500 requests/day on Gemini 1.5 Flash. Good for lower-volume setups.",
    hint:        "AIza...",
    group:       "AI Agent",
    badge:       "FREE",
    docsUrl:     "https://aistudio.google.com/apikey",
  },
  {
    key:         "ollama_url",
    label:       "Ollama (self-hosted)",
    description: "100% free — runs Llama 3.1 on your own server. Enter your Ollama base URL (e.g. http://localhost:11434/api). Requires llama3.1 model installed.",
    hint:        "http://localhost:11434/api",
    group:       "AI Agent",
    badge:       "FREE",
    docsUrl:     "https://ollama.com/download",
    isUrl:       true,
  },
  // ── Email ─────────────────────────────────────────────────────────────────
  {
    key:         "sendgrid",
    label:       "SendGrid",
    description: "Send booking confirmations, reminders, and cancellation emails via SendGrid.",
    hint:        "SG....",
    group:       "Email",
    badge:       null,
    docsUrl:     "https://app.sendgrid.com/settings/api_keys",
  },
  // ── SMS / WhatsApp ────────────────────────────────────────────────────────
  {
    key:         "twilio_sid",
    label:       "Twilio Account SID",
    description: "Required for WhatsApp messaging via Twilio and SMS reminders.",
    hint:        "AC...",
    group:       "SMS / WhatsApp",
    badge:       null,
    docsUrl:     "https://console.twilio.com",
  },
  {
    key:         "twilio_auth",
    label:       "Twilio Auth Token",
    description: "Paired with your Twilio Account SID.",
    hint:        "",
    group:       "SMS / WhatsApp",
    badge:       null,
    docsUrl:     "https://console.twilio.com",
  },
  // ── Payments ──────────────────────────────────────────────────────────────
  {
    key:         "stripe_secret",
    label:       "Stripe Secret Key",
    description: "Process payments for paid bookings (server-side). Also set in .env for platform-level billing.",
    hint:        "sk_live_... or sk_test_...",
    group:       "Payments",
    badge:       null,
    docsUrl:     "https://dashboard.stripe.com/apikeys",
  },
  {
    key:         "stripe_public",
    label:       "Stripe Publishable Key",
    description: "Used by the booking page frontend for Stripe Elements.",
    hint:        "pk_live_... or pk_test_...",
    group:       "Payments",
    badge:       null,
    docsUrl:     "https://dashboard.stripe.com/apikeys",
  },
] as const;

const GROUP_ORDER = ["AI Agent", "Email", "SMS / WhatsApp", "Payments"] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono";

// ─── Individual row ───────────────────────────────────────────────────────────

function ApiKeyRow({
  service,
  label,
  description,
  hint,
  badge,
  docsUrl,
  isUrl,
  configured,
  masked,
  updatedAt,
}: {
  service:    ServiceKey;
  label:      string;
  description:string;
  hint:       string;
  badge:      string | null;
  docsUrl:    string;
  isUrl?:     boolean;
  configured: boolean;
  masked?:    string;
  updatedAt?: Date | string;
}) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState("");

  const saveMutation   = trpc.tenant.setApiKey.useMutation({
    onSuccess: () => { utils.tenant.listApiKeys.invalidate(); setEditing(false); setValue(""); },
  });
  const deleteMutation = trpc.tenant.deleteApiKey.useMutation({
    onSuccess: () => utils.tenant.listApiKeys.invalidate(),
  });

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            {badge && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 tracking-wide">
                {badge}
              </span>
            )}
            {configured ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">configured</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400">not set</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          {configured && masked && (
            <p className="text-xs text-gray-400 mt-0.5 font-mono">
              {masked}
              {updatedAt && <> · Updated {new Date(updatedAt).toLocaleDateString()}</>}
            </p>
          )}
          <a
            href={docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-500 hover:underline mt-0.5 inline-block"
          >
            Get key →
          </a>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setEditing((v) => !v); setValue(""); }}
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
            type={isUrl ? "url" : "password"}
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
            <span className="text-xs text-red-600 self-center">{saveMutation.error.message}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const { data: keys, isLoading } = trpc.tenant.listApiKeys.useQuery();

  const keyMap  = Object.fromEntries((keys ?? []).map((k) => [k.service, k]));
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    services: SERVICES.filter((s) => s.group === group),
  }));

  // Count how many AI providers are configured
  const aiConfigured = ["anthropic", "openai", "groq", "gemini", "ollama_url"]
    .filter((k) => !!keyMap[k]).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Configure third-party service credentials. Keys are AES-256-GCM encrypted and never shown in full.
        </p>
      </div>

      {/* AI provider notice */}
      {!isLoading && aiConfigured === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">No AI provider configured</p>
          <p className="text-xs text-amber-700 mt-1">
            The booking agent won't work until at least one AI provider is set up.{" "}
            <strong>Groq is free</strong> and takes 30 seconds to set up — just grab a key at{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline">
              console.groq.com
            </a>.
          </p>
        </div>
      )}
      {!isLoading && aiConfigured > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
          <p className="text-xs text-blue-700">
            <strong>{aiConfigured} AI providers configured.</strong> The agent will use the first one in priority order: Anthropic → OpenAI → Groq → Gemini → Ollama.
          </p>
        </div>
      )}

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
                  service={s.key as ServiceKey}
                  label={s.label}
                  description={s.description}
                  hint={s.hint}
                  badge={s.badge}
                  docsUrl={s.docsUrl}
                  isUrl={"isUrl" in s ? s.isUrl : false}
                  configured={!!keyMap[s.key]}
                  masked={keyMap[s.key]?.masked}
                  updatedAt={keyMap[s.key]?.updatedAt}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
        <p className="text-xs font-semibold text-gray-700 mb-1">Security note</p>
        <p className="text-xs text-gray-500">
          API keys are encrypted at rest using AES-256-GCM with a per-installation encryption key.
          Only owners and admins can view, update, or remove keys. The full key value is never sent to the browser.
        </p>
      </div>
    </div>
  );
}
