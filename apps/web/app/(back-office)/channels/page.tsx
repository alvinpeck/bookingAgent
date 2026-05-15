// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

type ChannelType = "whatsapp" | "telegram";

const STATUS_BADGE: Record<string, string> = {
  active:         "bg-green-100 text-green-700",
  pending_setup:  "bg-amber-100 text-amber-700",
  inactive:       "bg-gray-100 text-gray-500",
  error:          "bg-red-100 text-red-600",
};

const CHANNEL_ICON: Record<ChannelType, string> = {
  whatsapp: "📱",
  telegram: "✈️",
};

const inputCls =
  "w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

// ─── Setup result panels ──────────────────────────────────────────────────────

function WhatsAppSetupResult({
  result,
  onDone,
}: {
  result: { id: string; verifyToken: string; webhookUrl: string };
  onDone: () => void;
}) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 space-y-4 mb-6">
      <h3 className="text-sm font-semibold text-indigo-900">
        WhatsApp channel created — complete the setup
      </h3>
      <p className="text-xs text-indigo-700">
        Go to <strong>Meta for Developers → WhatsApp → Configuration</strong> and add a webhook:
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
          <code className="block bg-white border border-gray-200 rounded px-3 py-2 text-xs break-all">
            {result.webhookUrl}
          </code>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Verify Token</label>
          <code className="block bg-white border border-gray-200 rounded px-3 py-2 text-xs break-all">
            {result.verifyToken}
          </code>
        </div>
      </div>
      <p className="text-xs text-indigo-600">
        Subscribe to the <strong>messages</strong> field. Once Meta verifies the URL, the channel
        status updates to <strong>active</strong> automatically.
      </p>
      <button
        onClick={onDone}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
      >
        Done
      </button>
    </div>
  );
}

function TelegramSetupResult({
  result,
  onDone,
}: {
  result: {
    id: string;
    webhookUrl: string;
    webhookSecret: string;
    setWebhookCmd: string;
  };
  onDone: () => void;
}) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 space-y-4 mb-6">
      <h3 className="text-sm font-semibold text-indigo-900">
        Telegram channel created — register the webhook
      </h3>
      <p className="text-xs text-indigo-700">
        Run this command once to point Telegram at your webhook:
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">setWebhook command</label>
        <code className="block bg-white border border-gray-200 rounded px-3 py-2 text-xs break-all whitespace-pre-wrap">
          {result.setWebhookCmd}
        </code>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Webhook URL</label>
          <code className="block bg-white border border-gray-200 rounded px-3 py-2 text-xs break-all">
            {result.webhookUrl}
          </code>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Secret Token</label>
          <code className="block bg-white border border-gray-200 rounded px-3 py-2 text-xs break-all">
            {result.webhookSecret}
          </code>
        </div>
      </div>
      <p className="text-xs text-indigo-600">
        The channel becomes <strong>active</strong> after the first message arrives. You can also
        click <strong>Mark active</strong> on the channel card.
      </p>
      <button
        onClick={onDone}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
      >
        Done
      </button>
    </div>
  );
}

// ─── Add channel form ─────────────────────────────────────────────────────────

function AddChannelForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (type: ChannelType, result: unknown) => void;
}) {
  const [type, setType] = useState<ChannelType>("whatsapp");
  const [waForm, setWaForm] = useState({
    displayName: "",
    phoneNumberId: "",
    appSecret: "",
    accessToken: "",
  });
  const [tgForm, setTgForm] = useState({
    displayName: "",
    botUsername: "",
    botToken: "",
  });

  const utils = trpc.useUtils();

  const createWa = trpc.channels.createWhatsapp.useMutation({
    onSuccess: (data) => {
      utils.channels.list.invalidate();
      onCreated("whatsapp", data);
    },
  });
  const createTg = trpc.channels.createTelegram.useMutation({
    onSuccess: (data) => {
      utils.channels.list.invalidate();
      onCreated("telegram", data);
    },
  });

  const isPending = createWa.isPending || createTg.isPending;
  const error = createWa.error?.message ?? createTg.error?.message;

  return (
    <div className="bg-white rounded-xl border border-indigo-200 p-6 mb-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-700">Add messaging channel</h2>

      {/* Type tabs */}
      <div className="flex gap-2">
        {(["whatsapp", "telegram"] as ChannelType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              type === t
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {CHANNEL_ICON[t]}&nbsp;{t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* WhatsApp fields */}
      {type === "whatsapp" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Display name *</label>
            <input
              type="text"
              value={waForm.displayName}
              onChange={(e) => setWaForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="e.g. My Business WhatsApp"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Phone Number ID *</label>
            <input
              type="text"
              value={waForm.phoneNumberId}
              onChange={(e) => setWaForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
              placeholder="From Meta → WhatsApp → API Setup"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">App Secret *</label>
            <input
              type="password"
              value={waForm.appSecret}
              onChange={(e) => setWaForm((f) => ({ ...f, appSecret: e.target.value }))}
              placeholder="From Meta App → Settings → Basic"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">
              Stored AES-256-GCM encrypted. Used to verify inbound webhook signatures.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Access Token *</label>
            <input
              type="password"
              value={waForm.accessToken}
              onChange={(e) => setWaForm((f) => ({ ...f, accessToken: e.target.value }))}
              placeholder="From Meta System User — EAAxxxxx..."
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">
              Required to send replies. Get it from Meta Business Manager → System Users → Generate Token.
            </p>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              disabled={
                !waForm.displayName ||
                !waForm.phoneNumberId ||
                !waForm.appSecret ||
                !waForm.accessToken ||
                isPending
              }
              onClick={() => createWa.mutate(waForm)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg"
            >
              {isPending ? "Creating…" : "Create channel"}
            </button>
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}

      {/* Telegram fields */}
      {type === "telegram" && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Display name *</label>
            <input
              type="text"
              value={tgForm.displayName}
              onChange={(e) => setTgForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="e.g. My Business Bot"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bot username *</label>
            <input
              type="text"
              value={tgForm.botUsername}
              onChange={(e) => setTgForm((f) => ({ ...f, botUsername: e.target.value }))}
              placeholder="@mybusinessbot"
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Bot Token *</label>
            <input
              type="password"
              value={tgForm.botToken}
              onChange={(e) => setTgForm((f) => ({ ...f, botToken: e.target.value }))}
              placeholder="From @BotFather — 123456:ABC..."
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">
              Stored AES-256-GCM encrypted. You&apos;ll get a ready-made setWebhook command after saving.
            </p>
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              disabled={
                !tgForm.displayName ||
                !tgForm.botUsername ||
                !tgForm.botToken ||
                isPending
              }
              onClick={() => createTg.mutate(tgForm)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg"
            >
              {isPending ? "Creating…" : "Create channel"}
            </button>
            <button
              onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline edit panel ────────────────────────────────────────────────────────

type ChannelItem = {
  id: string;
  type: string;
  status: string;
  displayName: string;
  lastWebhookAt?: Date | string | null;
  lastErrorMessage?: string | null;
  [key: string]: unknown;
};

function EditChannelPanel({
  ch,
  onClose,
}: {
  ch: ChannelItem;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [displayName, setDisplayName] = useState(ch.displayName);
  const [phoneNumberId, setPhoneNumberId] = useState(
    (ch as any).whatsappPhoneNumberId ?? ""
  );
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [botUsername, setBotUsername] = useState(
    (ch as any).telegramBotUsername ?? ""
  );
  const [botToken, setBotToken] = useState("");

  const updateMutation = trpc.channels.update.useMutation({
    onSuccess: () => {
      utils.channels.list.invalidate();
      onClose();
    },
  });

  function handleSave() {
    const payload: Parameters<typeof updateMutation.mutate>[0] = { id: ch.id };
    if (displayName !== ch.displayName) payload.displayName = displayName;
    if (ch.type === "whatsapp") {
      if (phoneNumberId !== ((ch as any).whatsappPhoneNumberId ?? ""))
        payload.phoneNumberId = phoneNumberId;
      if (appSecret) payload.appSecret = appSecret;
      if (accessToken) payload.accessToken = accessToken;
    }
    if (ch.type === "telegram") {
      if (botUsername !== ((ch as any).telegramBotUsername ?? ""))
        payload.botUsername = botUsername;
      if (botToken) payload.botToken = botToken;
    }
    updateMutation.mutate(payload);
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputCls}
          />
        </div>

        {ch.type === "whatsapp" && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone Number ID</label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="From Meta → WhatsApp → API Setup"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                App Secret{" "}
                <span className="text-gray-400">(leave blank to keep current)</span>
              </label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="Only fill to replace"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Access Token <span className="text-gray-400">(leave blank to keep current)</span>
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Only fill to replace"
                className={inputCls}
              />
            </div>
          </>
        )}

        {ch.type === "telegram" && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bot username</label>
              <input
                type="text"
                value={botUsername}
                onChange={(e) => setBotUsername(e.target.value)}
                placeholder="@mybusinessbot"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Bot Token{" "}
                <span className="text-gray-400">(leave blank to keep current)</span>
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Only fill to replace"
                className={inputCls}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!displayName || updateMutation.isPending}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-medium rounded-md"
        >
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        {updateMutation.isError && (
          <span className="text-xs text-red-600">{updateMutation.error.message}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChannelsPage() {
  const utils = trpc.useUtils();
  const { data: channelList, isLoading } = trpc.channels.list.useQuery();

  const activateMutation = trpc.channels.activate.useMutation({
    onSuccess: () => utils.channels.list.invalidate(),
  });
  const deleteMutation = trpc.channels.delete.useMutation({
    onSuccess: () => utils.channels.list.invalidate(),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<
    | {
        type: "whatsapp";
        data: { id: string; verifyToken: string; webhookUrl: string };
      }
    | {
        type: "telegram";
        data: {
          id: string;
          webhookUrl: string;
          webhookSecret: string;
          setWebhookCmd: string;
        };
      }
    | null
  >(null);

  function handleCreated(type: ChannelType, data: unknown) {
    setShowAdd(false);
    setSetupResult({ type, data } as typeof setupResult);
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Channels</h1>
          <p className="mt-1 text-sm text-gray-500">
            Connect WhatsApp and Telegram so customers can book via messaging.
          </p>
        </div>
        {!showAdd && !setupResult && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add channel
          </button>
        )}
      </div>

      {/* Post-creation setup instructions */}
      {setupResult?.type === "whatsapp" && (
        <WhatsAppSetupResult
          result={setupResult.data}
          onDone={() => setSetupResult(null)}
        />
      )}
      {setupResult?.type === "telegram" && (
        <TelegramSetupResult
          result={setupResult.data}
          onDone={() => setSetupResult(null)}
        />
      )}

      {/* Add form */}
      {showAdd && (
        <AddChannelForm
          onCancel={() => setShowAdd(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Channel list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 px-5 py-4 h-16 animate-pulse"
            />
          ))}
        </div>
      ) : !channelList?.length ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
          <p className="text-gray-500 text-sm font-medium">No channels configured</p>
          <p className="text-gray-400 text-xs mt-1 max-w-sm mx-auto">
            Add a WhatsApp or Telegram channel to let customers book via messaging.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {channelList.map((ch) => (
            <div
              key={ch.id}
              className={`bg-white rounded-xl border px-5 py-4 transition-colors ${
                editingId === ch.id ? "border-indigo-200" : "border-gray-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-lg shrink-0">
                    {CHANNEL_ICON[ch.type as ChannelType] ?? "💬"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {ch.displayName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[ch.status] ?? STATUS_BADGE.inactive}`}
                      >
                        {ch.status.replace("_", " ")}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 capitalize">
                        {ch.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ch.type === "whatsapp" && (ch as any).whatsappPhoneNumberId && (
                        <>Phone ID: {(ch as any).whatsappPhoneNumberId}</>
                      )}
                      {ch.type === "telegram" && (ch as any).telegramBotUsername && (
                        <>{(ch as any).telegramBotUsername}</>
                      )}
                      {ch.lastWebhookAt && (
                        <> · Last event: {new Date(ch.lastWebhookAt).toLocaleString()}</>
                      )}
                    </p>
                    {ch.status === "error" && ch.lastErrorMessage && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {ch.lastErrorMessage}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {ch.status === "pending_setup" && (
                    <button
                      onClick={() => activateMutation.mutate({ id: ch.id })}
                      disabled={activateMutation.isPending}
                      className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      Mark active
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingId((prev) => (prev === ch.id ? null : ch.id));
                      setConfirmDeleteId(null);
                    }}
                    className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                  >
                    {editingId === ch.id ? "Cancel" : "Edit"}
                  </button>
                  {confirmDeleteId === ch.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-gray-500 mr-1">Delete?</span>
                      <button
                        onClick={() => {
                          deleteMutation.mutate({ id: ch.id });
                          setConfirmDeleteId(null);
                        }}
                        disabled={deleteMutation.isPending}
                        className="text-xs text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 px-2 py-1 rounded-md transition-colors"
                      >
                        {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(ch.id)}
                      className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  {deleteMutation.isError && deleteMutation.variables?.id === ch.id && (
                    <span className="text-xs text-red-600 ml-1">
                      {deleteMutation.error.message}
                    </span>
                  )}
                </div>
              </div>

              {editingId === ch.id && (
                <EditChannelPanel
                  ch={ch as unknown as ChannelItem}
                  onClose={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Explainer */}
      <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">How it works</h3>
        <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
          <li>Add a channel and complete webhook setup with Meta or Telegram.</li>
          <li>Customers message your WhatsApp number or Telegram bot.</li>
          <li>The AI booking agent (Phase 10) handles the conversation and creates bookings.</li>
          <li>All conversations and bookings appear in the back office.</li>
        </ol>
        <p className="text-xs text-gray-400 mt-3">
          <strong>ENCRYPTION_KEY</strong> must be set in your environment — a 64-char hex string
          (32 bytes). Generate one with:{" "}
          <code className="bg-white border border-gray-200 rounded px-1 py-0.5">
            node -e &quot;console.log(require(&apos;crypto&apos;).randomBytes(32).toString(&apos;hex&apos;))&quot;
          </code>
        </p>
      </div>
    </div>
  );
}
