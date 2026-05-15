"use client";

import { signIn, useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInviteClient({
  token,
  tenantName,
  email,
}: {
  token: string;
  tenantName: string;
  email: string;
}) {
  const { data: session, status } = useSession();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function acceptInvite() {
    setAccepting(true);
    const res = await fetch(`/api/invite/${token}/accept`, { method: "POST" });
    if (res.ok) {
      // Hard navigate so middleware picks up the new active-tenant cookie
      window.location.href = "/dashboard";
    } else {
      const data = await res.json();
      setError(data.error ?? "Failed to accept invite");
      setAccepting(false);
    }
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            You&apos;re invited!
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            You&apos;ve been invited to join <strong>{tenantName}</strong>.
            Sign in to accept your invitation.
          </p>
          <a
            href={`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
            className="w-full flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors mb-3"
          >
            Sign in to accept
          </a>
          <button
            onClick={() => signIn("google", { callbackUrl: `/invite/${token}` })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.075 17.64 11.767 17.64 9.2z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Accept invitation
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Join <strong>{tenantName}</strong> as {session?.user?.email}
        </p>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        <button
          onClick={acceptInvite}
          disabled={accepting}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {accepting ? "Accepting…" : "Accept & Join Workspace"}
        </button>
      </div>
    </div>
  );
}
