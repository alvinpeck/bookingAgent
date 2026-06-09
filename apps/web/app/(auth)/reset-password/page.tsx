"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function Redirector() {
  const params = useSearchParams();
  const router = useRouter();
  const token  = params.get("token");

  useEffect(() => {
    // Old-format links included ?token=...&email=... — redirect to new path-param URL
    if (token) router.replace(`/reset-password/${token}`);
  }, [token, router]);

  if (token) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 text-center">
        <p className="text-red-600 text-sm mb-4">Invalid or missing reset link.</p>
        <Link href="/forgot-password" className="text-indigo-600 hover:underline text-sm">
          Request a new one
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <Redirector />
    </Suspense>
  );
}
