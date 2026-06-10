"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

type ChannelType = "whatsapp" | "telegram" | "web_widget";

function ChannelBadge({ type }: { type: ChannelType }) {
  const styles: Record<ChannelType, { bg: string; text: string; label: string }> = {
    whatsapp:   { bg: "bg-green-100",  text: "text-green-700",  label: "WhatsApp" },
    telegram:   { bg: "bg-blue-100",   text: "text-blue-700",   label: "Telegram" },
    web_widget: { bg: "bg-gray-100",   text: "text-gray-600",   label: "Web" },
  };
  const s = styles[type] ?? styles.web_widget;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function formatTime(date: Date | string | null) {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

function formatUserId(externalUserId: string, channelType: ChannelType) {
  if (channelType === "telegram" && externalUserId.startsWith("user_")) {
    return externalUserId.replace("user_", "User ");
  }
  // WhatsApp phone numbers — add + prefix if missing
  if (channelType === "whatsapp" && /^\d+$/.test(externalUserId)) {
    return `+${externalUserId}`;
  }
  return externalUserId;
}

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: convos, isLoading } = trpc.conversations.list.useQuery();

  const { data: thread, isLoading: threadLoading } = trpc.conversations.getMessages.useQuery(
    { conversationId: selectedId! },
    { enabled: !!selectedId }
  );

  const selected = convos?.find((c) => c.id === selectedId);

  return (
    <div className="flex gap-0 h-[calc(100vh-8rem)] -mx-6 -my-8">
      {/* ── Left panel: conversation list ── */}
      <div className="w-80 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-base font-semibold text-gray-900">Conversations</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {convos ? `${convos.length} total` : "Loading..."}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && convos?.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-900">No conversations yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Conversations from WhatsApp and Telegram will appear here.
              </p>
            </div>
          )}

          {convos?.map((convo) => (
            <button
              key={convo.id}
              onClick={() => setSelectedId(convo.id)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                selectedId === convo.id ? "bg-indigo-50 border-l-2 border-indigo-500" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ChannelBadge type={convo.channelType as ChannelType} />
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {formatUserId(convo.externalUserId, convo.channelType as ChannelType)}
                  </span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatTime(convo.lastMessageAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500 truncate">{convo.channelName}</span>
                {convo.isActive && (
                  <span className="flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                )}
                {convo.bookingId && (
                  <span className="text-xs text-indigo-500 font-medium">Booked</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Right panel: message thread ── */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {!selectedId && (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-full bg-white border border-gray-200 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Select a conversation</p>
            <p className="text-xs text-gray-500 mt-1">Choose a conversation from the left to view messages.</p>
          </div>
        )}

        {selectedId && (
          <>
            {/* Thread header */}
            <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selected && <ChannelBadge type={selected.channelType as ChannelType} />}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {selected ? formatUserId(selected.externalUserId, selected.channelType as ChannelType) : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selected?.channelName} · Started {formatTime(selected?.createdAt ?? null)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected?.bookingId && (
                  <a
                    href={`/bookings/${selected.bookingId}`}
                    className="text-xs text-indigo-600 font-medium hover:underline"
                  >
                    View booking
                  </a>
                )}
                {selected?.isActive ? (
                  <span className="text-xs text-green-600 font-medium">Active</span>
                ) : (
                  <span className="text-xs text-gray-400">Ended</span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {threadLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                      <div className="h-10 w-48 bg-gray-200 rounded-2xl animate-pulse" />
                    </div>
                  ))}
                </div>
              )}

              {!threadLoading && thread?.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-sm text-gray-500">No messages in memory.</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Messages are kept for 24 hours. This conversation may have expired.
                  </p>
                </div>
              )}

              {thread?.messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-white border border-gray-200 text-gray-800 rounded-tl-sm"
                        : "bg-indigo-600 text-white rounded-tr-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Read-only notice */}
            <div className="px-6 py-3 bg-white border-t border-gray-200">
              <p className="text-xs text-gray-400 text-center">
                Read-only view · Replies are sent through WhatsApp or Telegram directly
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
