/**
 * Root admin layout — no auth check here.
 * Auth is enforced in app/admin/(protected)/layout.tsx.
 * This allows /admin/login to render without redirect loops.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
