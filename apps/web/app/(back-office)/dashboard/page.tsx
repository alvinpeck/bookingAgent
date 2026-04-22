import { auth } from "@clerk/nextjs/server";
import { db, tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  const tenant = orgId
    ? await db.query.tenants.findFirst({
        where: eq(tenants.clerkOrgId, orgId),
      })
    : null;

  const tenantUser =
    tenant && userId
      ? await db.query.tenantUsers.findFirst({
          where: and(
            eq(tenantUsers.tenantId, tenant.id),
            eq(tenantUsers.clerkUserId, userId)
          ),
        })
      : null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back{tenantUser?.firstName ? `, ${tenantUser.firstName}` : ""}.
        </p>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatusCard label="Tenant" value={tenant?.name ?? "—"} />
        <StatusCard label="Plan" value={tenant?.plan ?? "—"} badge />
        <StatusCard label="Your role" value={tenantUser?.role ?? "—"} badge />
      </div>

      {/* Phase progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">
          Build progress
        </h2>
        <div className="space-y-2">
          {[
            { phase: "1–2", label: "Foundation + Backend", done: true },
            { phase: "3",   label: "Auth + Onboarding",    done: true },
            { phase: "5",   label: "Slot engine",          done: false },
            { phase: "6",   label: "Google Calendar",      done: false },
            { phase: "7",   label: "Back-office UI",       done: false },
            { phase: "8",   label: "Public booking site",  done: false },
            { phase: "9",   label: "WhatsApp / Telegram",  done: false },
            { phase: "10",  label: "AI booking agent",     done: false },
          ].map(({ phase, label, done }) => (
            <div key={phase} className="flex items-center gap-3 text-sm">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  done
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? "✓" : "·"}
              </span>
              <span className={done ? "text-gray-700" : "text-gray-400"}>
                Phase {phase} — {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      {badge ? (
        <span className="mt-1 inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium capitalize">
          {value}
        </span>
      ) : (
        <p className="mt-1 text-base font-semibold text-gray-900">{value}</p>
      )}
    </div>
  );
}
