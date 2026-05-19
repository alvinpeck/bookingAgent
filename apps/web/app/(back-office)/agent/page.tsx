// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";

// ─── Constants (mirror agent.ts) ─────────────────────────────────────────────

const TONE_OPTIONS = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm, conversational, light emojis. Like a helpful friend.",
  },
  {
    value: "formal",
    label: "Formal",
    description: "Professional and respectful. No emojis. Concise.",
  },
  {
    value: "casual",
    label: "Casual",
    description: "Relaxed and easy-going. Short sentences. No jargon.",
  },
] as const;

const LANGUAGE_OPTIONS = [
  { value: "en",    label: "English" },
  { value: "ms",    label: "Bahasa Malaysia" },
  { value: "zh",    label: "Chinese (Simplified)" },
  { value: "zh-tw", label: "Chinese (Traditional)" },
  { value: "th",    label: "Thai" },
  { value: "id",    label: "Indonesian (Bahasa Indonesia)" },
  { value: "tl",    label: "Filipino (Tagalog)" },
  { value: "vi",    label: "Vietnamese" },
  { value: "ar",    label: "Arabic" },
  { value: "hi",    label: "Hindi" },
  { value: "fr",    label: "French" },
  { value: "de",    label: "German" },
  { value: "es",    label: "Spanish" },
  { value: "pt",    label: "Portuguese" },
  { value: "ja",    label: "Japanese" },
  { value: "ko",    label: "Korean" },
];

const TONE_INSTRUCTIONS: Record<string, string> = {
  friendly: "Be warm, conversational and use light emojis (1–2 per message max). Sound like a helpful friend.",
  formal:   "Be professional and respectful. Use polite language. No emojis. Keep responses concise.",
  casual:   "Be relaxed and easy-going. Short sentences. Can use casual expressions but stay professional.",
};

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.map((l) => [l.value, l.label])
);

// ─── Provider / model catalogue ───────────────────────────────────────────────

type ProviderKey = "anthropic" | "openai" | "groq" | "gemini" | "ollama";

interface ProviderDef {
  label:       string;
  hint:        string;           // matches the API_KEY_SERVICES hint
  settingKey:  string;           // matches the apikey:* tenant-setting key
  badge:       string;           // short cost/tier label
  badgeCls:    string;
  models: { value: string; label: string; note?: string }[];
}

const PROVIDERS: Record<ProviderKey, ProviderDef> = {
  anthropic: {
    label:      "Anthropic (Claude)",
    hint:       "sk-ant-...",
    settingKey: "anthropic",
    badge:      "Paid",
    badgeCls:   "bg-purple-100 text-purple-700",
    models: [
      { value: "claude-haiku-4-5-20251001",    label: "Claude Haiku 4.5",    note: "Fast · low cost" },
      { value: "claude-3-5-haiku-20241022",     label: "Claude 3.5 Haiku",    note: "Fast · cheap" },
      { value: "claude-3-5-sonnet-20241022",    label: "Claude 3.5 Sonnet",   note: "Smart · balanced" },
      { value: "claude-opus-4-5-20251001",      label: "Claude Opus 4.5",     note: "Most capable" },
    ],
  },
  openai: {
    label:      "OpenAI (GPT)",
    hint:       "sk-...",
    settingKey: "openai",
    badge:      "Paid",
    badgeCls:   "bg-green-100 text-green-700",
    models: [
      { value: "gpt-4o-mini",  label: "GPT-4o Mini",  note: "Fast · cheap" },
      { value: "gpt-4o",       label: "GPT-4o",        note: "Smart · balanced" },
      { value: "gpt-4-turbo",  label: "GPT-4 Turbo",   note: "Powerful" },
    ],
  },
  groq: {
    label:      "Groq (Llama)",
    hint:       "gsk_...",
    settingKey: "groq",
    badge:      "Free",
    badgeCls:   "bg-amber-100 text-amber-700",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile", note: "Best for tools" },
      { value: "llama-3.1-8b-instant",    label: "Llama 3.1 8B Instant",    note: "Fastest" },
      { value: "mixtral-8x7b-32768",      label: "Mixtral 8x7B",             note: "Long context" },
    ],
  },
  gemini: {
    label:      "Google Gemini",
    hint:       "AIza...",
    settingKey: "gemini",
    badge:      "Free tier",
    badgeCls:   "bg-blue-100 text-blue-700",
    models: [
      { value: "gemini-1.5-flash",   label: "Gemini 1.5 Flash",  note: "1 500 req/day free" },
      { value: "gemini-1.5-pro",     label: "Gemini 1.5 Pro",    note: "More capable" },
      { value: "gemini-2.0-flash",   label: "Gemini 2.0 Flash",  note: "Latest" },
    ],
  },
  ollama: {
    label:      "Ollama (self-hosted)",
    hint:       "http://localhost:11434/api",
    settingKey: "ollama_url",
    badge:      "100% free",
    badgeCls:   "bg-gray-100 text-gray-600",
    models: [
      { value: "llama3.1",  label: "Llama 3.1",  note: "Good tool calling" },
      { value: "llama3.2",  label: "Llama 3.2",  note: "Smaller / faster" },
      { value: "mistral",   label: "Mistral 7B",  note: "Balanced" },
      { value: "phi3",      label: "Phi-3",        note: "Very small" },
    ],
  },
};

// ─── Style helpers ────────────────────────────────────────────────────────────

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white";
const textareaCls =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white resize-none";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";
const hintCls  = "text-xs text-gray-400 mt-1";

// ─── Live preview builder (mirrors buildSystemPrompt in agent.ts) ─────────────

function buildPreviewPrompt(
  form: Form,
  businessName: string,
  sampleServices: string[]
): string {
  const langInstruction =
    form.language && form.language !== "en"
      ? `IMPORTANT: Always respond in ${LANGUAGE_NAMES[form.language] ?? form.language}. Even if the user writes in English, reply in ${LANGUAGE_NAMES[form.language] ?? form.language}.`
      : "Respond in the same language the user writes in.";

  const toneInstruction =
    TONE_INSTRUCTIONS[form.tone] ?? TONE_INSTRUCTIONS["friendly"]!;

  const servicesBlock =
    sampleServices.length > 0
      ? `SERVICES OFFERED:\n${sampleServices.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "SERVICES OFFERED:\n(No services configured yet)";

  const businessInfoBlock = form.businessInfo.trim()
    ? `ABOUT THE BUSINESS:\n${form.businessInfo.trim()}`
    : "";

  const customBlock = form.customInstructions.trim()
    ? `ADDITIONAL INSTRUCTIONS FROM THE BUSINESS:\n${form.customInstructions.trim()}`
    : "";

  const greetingNote = form.greeting.trim()
    ? `CUSTOM GREETING:\n"${form.greeting.trim()}"`
    : "";

  const closingNote = form.closingMessage.trim()
    ? `CLOSING MESSAGE:\n"${form.closingMessage.trim()}"`
    : "";

  const fallbackNote = form.fallbackMessage.trim()
    ? `FALLBACK (when unsure):\n"${form.fallbackMessage.trim()}"`
    : "";

  return [
    `You are ${form.name || "a booking assistant"} for ${businessName || "this business"}.`,
    `Your ONLY purpose is to help customers book, view, and cancel appointments.`,
    ``,
    `TONE: ${toneInstruction}`,
    ``,
    `LANGUAGE: ${langInstruction}`,
    ``,
    servicesBlock,
    businessInfoBlock && ``,
    businessInfoBlock,
    ``,
    `BOOKING FLOW:`,
    `1. Greet the customer and show the main menu`,
    `2. Help them pick a service, then a date and time`,
    `3. Collect: full name, phone number, email`,
    `4. Show a full summary and ask "Shall I confirm this booking?"`,
    `5. ONLY call createBooking after the customer confirms`,
    ``,
    greetingNote,
    closingNote,
    fallbackNote,
    customBlock,
  ]
    .filter((line) => line !== undefined && line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Form {
  name:               string;
  tone:               "friendly" | "formal" | "casual";
  language:           string;
  greeting:           string;
  businessInfo:       string;
  customInstructions: string;
  closingMessage:     string;
  fallbackMessage:    string;
  provider:           string;  // "" = auto-priority
  model:              string;  // "" = default for chosen provider
}

const DEFAULT_FORM: Form = {
  name:               "",
  tone:               "friendly",
  language:           "en",
  greeting:           "",
  businessInfo:       "",
  customInstructions: "",
  closingMessage:     "",
  fallbackMessage:    "",
  provider:           "",
  model:              "",
};

// ─── Section card wrapper ─────────────────────────────────────────────────────

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Tone selector ────────────────────────────────────────────────────────────

function ToneSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: "friendly" | "formal" | "casual") => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TONE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-left rounded-lg border px-4 py-3 transition-colors ${
            value === opt.value
              ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <span className="block text-sm font-medium text-gray-900">
            {opt.label}
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">
            {opt.description}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Live preview panel ───────────────────────────────────────────────────────

function LivePreview({
  form,
  businessName,
  sampleServices,
}: {
  form: Form;
  businessName: string;
  sampleServices: string[];
}) {
  const preview = buildPreviewPrompt(form, businessName, sampleServices);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800">
        <span className="text-xs font-mono text-gray-400">
          SYSTEM PROMPT PREVIEW
        </span>
        <span className="text-xs text-gray-500">
          {preview.length} chars
        </span>
      </div>
      <pre className="p-4 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
        {preview}
      </pre>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AgentSettingsPage() {
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch existing settings
  const { data: settings, isLoading } = trpc.tenant.getAgentSettings.useQuery();

  // Fetch active services for the preview
  const { data: serviceList } = trpc.services.list.useQuery();

  // Fetch tenant info for business name
  const { data: tenantData } = trpc.tenant.getCurrent.useQuery();

  // Fetch configured API keys so we can show which providers are available
  const { data: configuredKeys } = trpc.tenant.listApiKeys.useQuery();

  const utils = trpc.useUtils();

  const saveMutation = trpc.tenant.saveAgentSettings.useMutation({
    onSuccess: () => {
      utils.tenant.getAgentSettings.invalidate();
      setSaved(true);
      setIsDirty(false);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  // Hydrate form once settings load
  useEffect(() => {
    if (settings) {
      setForm({
        name:               settings.name,
        tone:               (settings.tone as Form["tone"]) || "friendly",
        language:           settings.language || "en",
        greeting:           settings.greeting,
        businessInfo:       settings.businessInfo,
        customInstructions: settings.customInstructions,
        closingMessage:     settings.closingMessage,
        fallbackMessage:    settings.fallbackMessage,
        provider:           settings.provider || "",
        model:              settings.model    || "",
      });
    }
  }, [settings]);

  const update = useCallback(
    (field: keyof Form, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setIsDirty(true);
      setSaved(false);
    },
    []
  );

  const sampleServices: string[] = serviceList
    ? serviceList.map((s: any) => `${s.name} — ${s.durationMinutes} min`)
    : [];

  const businessName = tenantData?.name ?? "";

  // Build set of provider keys that have a configured API key
  const configuredProviderKeys = new Set<string>(
    (configuredKeys ?? []).map((k: any) => k.service)
  );

  // Models for the currently selected provider
  const currentProviderModels =
    form.provider && PROVIDERS[form.provider as ProviderKey]
      ? PROVIDERS[form.provider as ProviderKey].models
      : [];

  function handleSave() {
    saveMutation.mutate(form);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-6 h-32 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">AI Agent Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Personalise the AI booking assistant for your business — name, tone, language, and messaging style.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            className="px-3 py-2 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {showPreview ? "Hide preview" : "Preview prompt"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !isDirty}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saveMutation.isPending ? "Saving…" : saved ? "✓ Saved" : "Save changes"}
          </button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {saveMutation.error.message}
        </div>
      )}

      {/* ── Identity ─────────────────────────────────────────────────────────── */}
      <Card
        title="Agent identity"
        description="How the agent introduces itself to customers."
      >
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}>Agent name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={60}
              placeholder={`e.g. ${businessName ? businessName + " Assistant" : "BookBot"}`}
              className={inputCls}
            />
            <p className={hintCls}>
              The name customers see, e.g. "Hi, I'm Aria from Beauty Studio."
            </p>
          </div>
          <div>
            <label className={labelCls}>Response language</label>
            <select
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
              className={inputCls}
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <p className={hintCls}>
              {form.language === "en"
                ? "Auto-detects the user's language and replies accordingly."
                : `Always replies in ${LANGUAGE_NAMES[form.language] ?? form.language}, even if the customer writes in English.`}
            </p>
          </div>
        </div>
      </Card>

      {/* ── AI Provider & Model ──────────────────────────────────────────────── */}
      <Card
        title="AI provider & model"
        description="Choose which AI engine powers this tenant's booking assistant."
      >
        {/* No keys configured at all */}
        {configuredKeys && configuredKeys.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
            No API keys configured yet.{" "}
            <a href="/settings/api-keys" className="underline font-medium">
              Go to API Keys →
            </a>{" "}
            to add at least one provider, then come back here to choose it.
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-5">
          {/* Provider picker */}
          <div>
            <label className={labelCls}>Provider</label>
            <div className="space-y-2">
              {/* Auto option */}
              <label
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  form.provider === ""
                    ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value=""
                  checked={form.provider === ""}
                  onChange={() => { update("provider", ""); update("model", ""); }}
                  className="accent-indigo-600"
                />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900">Auto (priority order)</span>
                  <span className="block text-xs text-gray-500">
                    Uses the first key found: Anthropic → OpenAI → Groq → Gemini → Ollama
                  </span>
                </div>
              </label>

              {/* One radio per provider */}
              {(Object.entries(PROVIDERS) as [ProviderKey, ProviderDef][]).map(([key, def]) => {
                const hasKey = configuredProviderKeys.has(def.settingKey);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      !hasKey
                        ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                        : form.provider === key
                        ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400 cursor-pointer"
                        : "border-gray-200 hover:border-gray-300 cursor-pointer"
                    }`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={key}
                      checked={form.provider === key}
                      disabled={!hasKey}
                      onChange={() => {
                        update("provider", key);
                        // Reset model to default when switching provider
                        update("model", "");
                      }}
                      className="accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{def.label}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${def.badgeCls}`}>
                          {def.badge}
                        </span>
                        {!hasKey && (
                          <span className="text-xs text-gray-400">— no key</span>
                        )}
                        {hasKey && (
                          <span className="text-xs text-green-600 font-medium">✓ configured</span>
                        )}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className={hintCls}>
              Only providers with a configured API key can be selected.{" "}
              <a href="/settings/api-keys" className="text-indigo-600 hover:underline">
                Manage keys →
              </a>
            </p>
          </div>

          {/* Model picker */}
          <div>
            <label className={labelCls}>Model</label>
            {!form.provider ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-400">
                Select a specific provider above to choose a model.<br />
                In Auto mode, the default model for each provider is used.
              </div>
            ) : (
              <div className="space-y-2">
                {currentProviderModels.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      (form.model === m.value) || (form.model === "" && m === currentProviderModels[0])
                        ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-400"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.value}
                      checked={form.model === m.value || (form.model === "" && m === currentProviderModels[0])}
                      onChange={() => update("model", m.value)}
                      className="accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{m.label}</span>
                      {m.note && (
                        <span className="block text-xs text-gray-500">{m.note}</span>
                      )}
                    </div>
                    {m === currentProviderModels[0] && (
                      <span className="text-xs text-gray-400 shrink-0">Default</span>
                    )}
                  </label>
                ))}
              </div>
            )}
            <p className={hintCls}>
              {form.provider
                ? "The first option is the default if nothing is explicitly saved."
                : ""}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Tone ─────────────────────────────────────────────────────────────── */}
      <Card
        title="Conversation tone"
        description="Pick the personality style that fits your brand."
      >
        <ToneSelector
          value={form.tone}
          onChange={(v) => update("tone", v)}
        />
      </Card>

      {/* ── Messaging ────────────────────────────────────────────────────────── */}
      <Card
        title="Custom messages"
        description="Control exactly what the agent says at key moments."
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Greeting message</label>
            <textarea
              rows={3}
              value={form.greeting}
              onChange={(e) => update("greeting", e.target.value)}
              maxLength={500}
              placeholder={`e.g. Hi there! 👋 Welcome to ${businessName || "our clinic"}. How can I help you today?\n1. Book appointment\n2. Check available times\n3. View / cancel booking`}
              className={textareaCls}
            />
            <p className={hintCls}>
              Sent when a customer says hi, hello, start, or menu. Leave blank to use the default.
            </p>
          </div>

          <div>
            <label className={labelCls}>Closing / thank-you message</label>
            <textarea
              rows={3}
              value={form.closingMessage}
              onChange={(e) => update("closingMessage", e.target.value)}
              maxLength={500}
              placeholder={`e.g. Thank you for booking with us! We look forward to seeing you. If you need to reschedule, just message us here.`}
              className={textareaCls}
            />
            <p className={hintCls}>
              Appended after every successful booking confirmation.
            </p>
          </div>

          <div>
            <label className={labelCls}>Fallback message</label>
            <textarea
              rows={2}
              value={form.fallbackMessage}
              onChange={(e) => update("fallbackMessage", e.target.value)}
              maxLength={500}
              placeholder={`e.g. Sorry, I didn't quite get that. Type "menu" to see your options, or call us at +60 12-345 6789.`}
              className={textareaCls}
            />
            <p className={hintCls}>
              Used when the agent is unsure how to respond.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Business context ─────────────────────────────────────────────────── */}
      <Card
        title="Business context"
        description="Extra information the agent can use when customers ask questions."
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>About the business</label>
            <textarea
              rows={5}
              value={form.businessInfo}
              onChange={(e) => update("businessInfo", e.target.value)}
              maxLength={2000}
              placeholder={`e.g. We are a premium beauty salon located at Level 2, Pavilion KL.\nParking is available at the building. We accept cash, card, and e-wallet.\nOur specialists have 10+ years of experience.\nCancellations must be made 24 hours in advance.`}
              className={textareaCls}
            />
            <p className={hintCls}>
              Address, parking, payment methods, cancellation policy, special notes, etc.
            </p>
          </div>

          <div>
            <label className={labelCls}>Custom instructions for the agent</label>
            <textarea
              rows={5}
              value={form.customInstructions}
              onChange={(e) => update("customInstructions", e.target.value)}
              maxLength={2000}
              placeholder={`e.g. - Always upsell the Premium Package when the customer books a basic facial.\n- If a customer asks about promotions, tell them to follow our Instagram @beautystudio for the latest deals.\n- Do not accept same-day bookings — minimum 24 hours notice required.\n- If a customer sounds unhappy, offer to connect them to our manager.`}
              className={textareaCls}
            />
            <p className={hintCls}>
              Business rules, upsell prompts, escalation instructions — anything the agent should always keep in mind.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Live prompt preview ───────────────────────────────────────────────── */}
      {showPreview && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-900">System prompt preview</h2>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
              Live
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            This is the exact instruction your AI agent receives at the start of every conversation.
            It updates in real time as you edit the fields above.
          </p>
          <LivePreview
            form={form}
            businessName={businessName}
            sampleServices={sampleServices}
          />
        </div>
      )}

      {/* ── Save bar (bottom) ─────────────────────────────────────────────────── */}
      {isDirty && (
        <div className="sticky bottom-6 flex items-center justify-between bg-indigo-900 text-white px-6 py-3 rounded-xl shadow-lg">
          <span className="text-sm">You have unsaved changes</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (settings) {
                  setForm({
                    name:               settings.name,
                    tone:               (settings.tone as Form["tone"]) || "friendly",
                    language:           settings.language || "en",
                    greeting:           settings.greeting,
                    businessInfo:       settings.businessInfo,
                    customInstructions: settings.customInstructions,
                    closingMessage:     settings.closingMessage,
                    fallbackMessage:    settings.fallbackMessage,
                    provider:           settings.provider || "",
                    model:              settings.model    || "",
                  });
                  setIsDirty(false);
                }
              }}
              className="text-sm text-indigo-300 hover:text-white"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-1.5 bg-white text-indigo-900 text-sm font-medium rounded-lg hover:bg-indigo-50 disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
