import { UserProfile } from "@clerk/nextjs";

/**
 * User profile page — Clerk's hosted UserProfile component handles:
 * - Name, avatar, email management
 * - MFA setup (TOTP authenticator app, SMS)
 * - Active sessions / device management
 * - Password management
 *
 * MFA is strongly recommended for all back-office users.
 * Enforce MFA at the Clerk dashboard level for admin/owner roles:
 *   Clerk Dashboard → Organizations → Settings → Require MFA
 */
export default function ProfilePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Your profile</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account, security, and active sessions.
        </p>
      </div>
      <UserProfile
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
