"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Workspace {
  tenantId: string;
  tenantName: string;
  role: string;
}

export default function WorkspaceSwitcher({
  userId,
  activeTenantId,
  tenantName,
}: {
  userId: string;
  activeTenantId: string;
  tenantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .catch(() => {});
  }, [userId]);

  async function switchTo(tenantId: string) {
    await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    setOpen(false);
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md hover:bg-gray-50 text-gray-700"
      >
        <span className="truncate font-medium">{tenantName}</span>
        <svg
          className="w-4 h-4 text-gray-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l4-4 4 4m0 6l-4 4-4-4"
          />
        </svg>
      </button>
      {open && workspaces.length > 1 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {workspaces.map((w) => (
            <button
              key={w.tenantId}
              onClick={() => switchTo(w.tenantId)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${
                w.tenantId === activeTenantId
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-700"
              }`}
            >
              {w.tenantName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
