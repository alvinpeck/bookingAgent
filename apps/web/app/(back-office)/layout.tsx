import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

const NAV_LINKS = [
  { href: "/dashboard",     label: "Dashboard" },
  { href: "/bookings",      label: "Bookings" },
  { href: "/services",      label: "Services" },
  { href: "/availability",  label: "Availability" },
  { href: "/staff",         label: "Staff" },
  { href: "/channels",      label: "Channels" },
  { href: "/integrations",  label: "Integrations" },
  { href: "/settings",          label: "Settings" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/audit",         label: "Audit Log" },
];

export default async function BackOfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

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
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-between text-xs px-2 py-1.5 rounded-md hover:bg-gray-50",
              },
            }}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-gray-200 flex items-center gap-2">
          <UserButton afterSignOutUrl="/sign-in" />
          <span className="text-xs text-gray-500 truncate">Account</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
