"use client";

import { signOut } from "next-auth/react";
import Image from "next/image";

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-indigo-100 text-indigo-700",
  admin: "bg-indigo-100 text-indigo-700",
  staff: "bg-gray-100 text-gray-600",
  readonly: "bg-gray-100 text-gray-600",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Admin",
  admin: "Admin",
  staff: "User",
  readonly: "User",
};

export default function UserMenu({
  name,
  email,
  image,
  role,
}: {
  name: string;
  email: string;
  image?: string;
  role: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-shrink-0">
        {image ? (
          <Image
            src={image}
            alt={name}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{name}</p>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {ROLE_LABEL[role] ?? "User"}
        </span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/sign-in" })}
        className="text-gray-400 hover:text-gray-600 transition-colors"
        title="Sign out"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </div>
  );
}
