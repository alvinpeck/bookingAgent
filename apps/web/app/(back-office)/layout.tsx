import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAdminImpersonation } from "@/lib/admin-auth";
import { db, tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";
import WorkspaceSwitcher from "@/components/WorkspaceSwitcher";
import UserMenu from "@/components/UserMenu";
import ExitPortalButton from "@/components/ExitPortalButton";

// ─── Nav definitions ──────────────────────────────────────────────────────────

// Admin (owner/admin) sees everything
const ADMIN_NAV = [
  { href: "/dashboard",         label: "Dashboard" },
  { href: "/bookings",          label: "Bookings" },
  { href: "/services",          label: "Services" },
  { href: "/availability",      label: "Availability" },
  { href: "/staff",             label: "Staff" },
  { href: "/channels",          label: "Channels" },
  { href: "/conversations",     label: "Conversations" },
  { href: "/agent",             label: "AI Agent" },
  { href: "/integrations",      label: "Integrations" },
  { href: "/usage",             label: "Usage" },
  { href: "/billing",           label: "Billing" },
  { href: "/settings",          label: "Settings" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/audit",             label: "Audit Log" },
];

// User (staff) sees only what they need
const USER_NAV = [
  { href: "/dashboard",    label: "Dashboard" },
  { href: "/bookings",     label: "Bookings" },
  { href: "/availability", label: "Availability" },
];

export default async function BackOfficeLayout({ children }: { children: React.ReactNode }) {
  const session       = await auth();
  const impersonation = await getAdminImpersonation();

  // Impersonation takes full priority over any existing NextAuth session —
  // this ensures clicking "Enter Portal" always lands in the correct workspace.
  const effectiveUserId = impersonation?.virtualUserId ?? session?.user?.id;

  if (!effectiveUserId) {
    redirect("/sign-in");
  }

  const cookieStore    = await cookies();
  const activeTenantId = cookieStore.get("active-tenant")?.value;

  // When impersonating, the signed JWT is the authoritative source of tenantId
  const resolvedTenantId = impersonation?.tenantId ?? activeTenantId;
  if (!resolvedTenantId) redirect("/onboarding");

  const [tenant, tenantUser] = await Promise.all([
    db.query.tenants.findFirst({
      where: eq(tenants.id, resolvedTenantId),
      columns: { id: true, name: true, slug: true },
    }),
    db.query.tenantUsers.findFirst({
      where: and(
        eq(tenantUsers.tenantId, resolvedTenantId),
        eq(tenantUsers.userId, effectiveUserId),
        eq(tenantUsers.isActive, true)
      ),
      columns: { role: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!tenantUser) redirect("/onboarding");

  const role      = tenantUser.role;
  const isAdmin   = role === "owner" || role === "admin";
  const navLinks  = isAdmin ? ADMIN_NAV : USER_NAV;

  const displayName =
    [tenantUser.firstName, tenantUser.lastName].filter(Boolean).join(" ") || tenantUser.email;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Super-admin impersonation banner */}
      {impersonation && (
        <div className="w-full bg-amber-400 px-4 py-2 flex items-center justify-between z-50 shrink-0">
          <p className="text-xs font-semibold text-amber-900 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Super Admin · Viewing workspace as owner
          </p>
          <ExitPortalButton />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          {/* Logo */}
          <div className="h-14 flex items-center px-4 border-b border-gray-200">
            <span className="text-sm font-semibold text-indigo-600 tracking-tight">
              BookingAgent
            </span>
          </div>

          {/* Workspace switcher — use effectiveUserId for workspace list */}
          <div className="px-3 py-3 border-b border-gray-100">
            <WorkspaceSwitcher
              userId={effectiveUserId}
              activeTenantId={resolvedTenantId}
              tenantName={tenant?.name ?? ""}
            />
          </div>

          {/* Public booking page link */}
          {tenant?.slug && (
            <div className="px-3 py-2 border-b border-gray-100">
              <a
                href={`/book/${tenant.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View booking page
              </a>
            </div>
          )}

          {/* Nav */}
          <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
            {navLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* User menu */}
          <div className="px-4 py-4 border-t border-gray-200">
            <UserMenu
              name={displayName}
              email={tenantUser.email}
              image={session?.user?.image ?? undefined}
              role={role}
            />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
