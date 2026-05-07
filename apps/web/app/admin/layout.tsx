import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminLogoutButton } from "./_components/AdminLogoutButton";

const NAV_LINKS = [
  { href: "/admin",         label: "Dashboard" },
  { href: "/admin/tenants", label: "Tenants" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminSession();

  if (!adminUser) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Dark sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo + Super Admin badge */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-800">
          <span className="text-sm font-semibold text-white tracking-tight">
            BookingAgent
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white uppercase tracking-wider">
            Super Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center px-3 py-2 text-sm text-slate-400 rounded-md hover:bg-slate-800 hover:text-white transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="mb-3">
            <p className="text-sm font-medium text-white truncate">{adminUser.name}</p>
            <p className="text-xs text-slate-500 truncate">{adminUser.email}</p>
          </div>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <div className="max-w-7xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
