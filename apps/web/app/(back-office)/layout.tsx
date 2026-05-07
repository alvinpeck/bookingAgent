import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, tenants, tenantUsers } from "@booking-agent/db";
import { eq, and } from "drizzle-orm";

// ─── Nav definitions ──────────────────────────────────────────────────────────

// Admin (owner/admin) sees everything
const ADMIN_NAV = [
  { href: "/dashboard",         label: "Dashboard" },
  { href: "/bookings",          label: "Bookings" },
  { href: "/services",          label: "Services" },
  { href: "/availability",      label: "Availability" },
  { href: "/staff",             label: "Staff" },
  { href: "/channels",          label: "Channels" },
  { href: "/integrations",      label: "Integrations" },
  { href: "/usage",             label: "Usage" },
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

const ROLE_LABEL: Record<string, string> = {
  owner:    "Admin",
  admin:    "Admin",
  staff:    "User",
  readonly: "User",
};

const ROLE_BADGE: Record<string, string> = {
  owner:    "bg-indigo-100 text-indigo-700",
  admin:    "bg-indigo-100 text-indigo-700",
  staff:    "bg-gray-100 text-gray-600",
  readonly: "bg-gray-100 text-gray-600",
};

export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

  // Resolve tenant + role
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.clerkOrgId, orgId),
    columns: { id: true },
  });

  const tenantUser = tenant
    ? await db.query.tenantUsers.findFirst({
        where: and(
          eq(tenantUsers.tenantId, tenant.id),
          eq(tenantUsers.clerkUserId, userId),
          eq(tenantUsers.isActive, true)
        ),
        columns: { role: true, firstName: true, lastName: true, email: true },
      })
    : null;

  const role = tenantUser?.role ?? "staff";
  const isAdmin = role === "owner" || role === "admin";
  const navLinks = isAdmin ? ADMIN_NAV : USER_NAV;
  const roleLabel = ROLE_LABEL[role] ?? "User";
  const roleBadge = ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-gray-200">
          <span className="text-sm font-semibold text-indigo-600 tracking-tight">
            BookingAgent
          </span>
        </div>

        {/* Org switcher */}
        <div className="px-3 py-3 border-b border-gray-100">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-between text-xs px-2 py-1.5 rounded-md hover:bg-gray-50",
                // Hide "Create organization" — only superadmin can create workspaces
                organizationSwitcherPopoverActionButton__createOrganization: "!hidden",
                organizationSwitcherPopoverActionButton__createOrganization__icon: "!hidden",
              },
            }}
          />
        </div>

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

        {/* User + role */}
        <div className="px-4 py-4 border-t border-gray-200 flex items-center gap-2">
          <UserButton afterSignOutUrl="/sign-in" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-gray-500 truncate">Account</span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full w-fit mt-0.5 ${roleBadge}`}>
              {roleLabel}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
