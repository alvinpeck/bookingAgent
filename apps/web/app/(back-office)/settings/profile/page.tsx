"use client";

import { useSession } from "next-auth/react";
import Image from "next/image";

export default function ProfilePage() {
  const { data: session } = useSession();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Your Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account details.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
        <div className="flex items-center gap-4 mb-6">
          {session?.user?.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name ?? "Profile"}
              width={64}
              height={64}
              className="rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xl font-bold">
              {(session?.user?.name ?? session?.user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900">{session?.user?.name}</p>
            <p className="text-sm text-gray-500">{session?.user?.email}</p>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Your profile is managed through your Google account. To update your
          name or photo, update your Google account.
        </p>
      </div>
    </div>
  );
}
