import { OrganizationProfile } from "@clerk/nextjs";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your workspace, members, and security settings.
        </p>
      </div>

      {/* MFA notice */}
      <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <span className="text-amber-500 text-lg mt-0.5">⚠</span>
        <div className="text-sm">
          <p className="font-medium text-amber-800">Enable MFA for your team</p>
          <p className="text-amber-700 mt-0.5">
            For back-office accounts handling bookings and integrations, we
            strongly recommend requiring MFA. Configure this in the{" "}
            <strong>Members</strong> tab below, or visit your{" "}
            <Link
              href="https://dashboard.clerk.com"
              target="_blank"
              className="underline"
            >
              Clerk dashboard
            </Link>{" "}
            to enforce MFA org-wide.
          </p>
        </div>
      </div>

      {/* Profile link */}
      <div className="mb-6">
        <Link
          href="/settings/profile"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          → Manage your personal profile &amp; MFA
        </Link>
      </div>

      {/* Clerk org profile: handles members, roles, invitations */}
      <OrganizationProfile
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border border-gray-200 rounded-xl",
          },
        }}
      />
    </div>
  );
}
