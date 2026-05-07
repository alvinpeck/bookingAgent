"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Onboarding page.
 *
 * Workspace creation is only allowed via the Super Admin dashboard (/admin).
 * Regular users who land here without an org are shown a "contact your admin" message.
 */
export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  // If the user already belongs to an org, send them to the dashboard
  useEffect(() => {
    if (isLoaded && user?.organizationMemberships?.length) {
      router.replace("/dashboard");
    }
  }, [isLoaded, user, router]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          No workspace assigned
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Your account hasn&apos;t been added to a workspace yet. Please contact your administrator to get access.
        </p>

        <div className="bg-gray-50 rounded-lg px-4 py-3 text-left text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-700">Signed in as</p>
          <p>{user?.primaryEmailAddress?.emailAddress ?? "—"}</p>
        </div>

        <a
          href="/sign-out"
          className="mt-5 block text-xs text-gray-400 hover:text-gray-600 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            // Use Clerk sign-out
            window.location.href = "/sign-in";
          }}
        >
          Sign in with a different account
        </a>
      </div>
    </div>
  );
}
