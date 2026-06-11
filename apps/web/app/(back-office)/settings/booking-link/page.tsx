"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
    >
      {copied ? "Copied!" : (label ?? "Copy")}
    </button>
  );
}

function CodeBlock({ code, language = "html" }: { code: string; language?: string }) {
  return (
    <div className="relative">
      <pre className="bg-gray-900 text-gray-100 rounded-xl p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <div className="absolute top-3 right-3">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export default function BookingLinkPage() {
  const { data: tenant, isLoading } = trpc.tenant.getCurrent.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <div className="w-7 h-7 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!tenant) return null;

  const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.bookingagent.app";
  const bookingUrl = `${appUrl}/book/${tenant.slug}`;

  const buttonEmbed = `<!-- Booking Agent button -->
<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer"
   style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;font-family:sans-serif;font-size:14px;font-weight:600">
  Book an appointment
</a>`;

  const iframeEmbed = `<!-- Booking Agent inline widget -->
<iframe
  src="${bookingUrl}"
  width="100%"
  height="700"
  frameborder="0"
  style="border-radius:12px;border:1px solid #e5e7eb"
  title="Book an appointment"
></iframe>`;

  const reactEmbed = `// React / Next.js
import Link from "next/link";

export function BookButton() {
  return (
    <Link
      href="${bookingUrl}"
      target="_blank"
      className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
    >
      Book an appointment
    </Link>
  );
}`;

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Booking Link & Widget</h1>
        <p className="mt-1 text-sm text-gray-500">
          Share your booking page or embed it on your website.
        </p>
      </div>

      {/* Direct link */}
      <Section
        title="Your booking page URL"
        description="Share this link anywhere — social media, email signature, WhatsApp bio."
      >
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm text-indigo-600 hover:underline truncate font-medium"
          >
            {bookingUrl}
          </a>
          <CopyButton value={bookingUrl} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Open booking page →
          </a>
        </div>
      </Section>

      {/* QR code */}
      <Section
        title="QR code"
        description="Print on business cards, menus, or posters. Customers scan to book instantly."
      >
        <div className="flex items-start gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrApiUrl}
            alt="Booking QR code"
            width={150}
            height={150}
            className="rounded-lg border border-gray-200"
          />
          <div className="space-y-3 flex-1">
            <p className="text-sm text-gray-600">
              Right-click the QR code image and save it, or use the URL below to download it programmatically.
            </p>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="flex-1 text-xs text-gray-500 truncate">{qrApiUrl}</span>
              <CopyButton value={qrApiUrl} label="Copy URL" />
            </div>
            <a
              href={qrApiUrl}
              download={`qr-${tenant.slug}.png`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Download PNG
            </a>
          </div>
        </div>
      </Section>

      {/* HTML button */}
      <Section
        title="HTML button embed"
        description='Paste into any website. Shows a "Book an appointment" button that opens your booking page.'
      >
        <CodeBlock code={buttonEmbed} />
      </Section>

      {/* Iframe embed */}
      <Section
        title="Inline widget (iframe)"
        description="Embed the full booking experience directly on your website page."
      >
        <CodeBlock code={iframeEmbed} />
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-800">
          For best results, place the iframe inside a container with a fixed or min-height. Test on mobile.
        </div>
      </Section>

      {/* React/Next.js */}
      <Section
        title="React / Next.js component"
        description="If your website is built with React or Next.js."
      >
        <CodeBlock code={reactEmbed} language="tsx" />
      </Section>

      {/* Slug info */}
      <div className="text-xs text-gray-400 pb-4">
        Your booking slug is <code className="bg-gray-100 px-1 py-0.5 rounded">{tenant.slug}</code>.
        To change it, contact support.
      </div>
    </div>
  );
}
