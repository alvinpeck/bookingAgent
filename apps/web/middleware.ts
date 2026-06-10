/**
 * Middleware — runs on Edge runtime.
 * Uses its OWN NextAuth instance built from the Edge-safe authConfig.
 * NEVER imports from auth.ts (which pulls in DrizzleAdapter / Node.js code).
 */
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

const BACK_OFFICE_PATHS = [
  "/dashboard",
  "/bookings",
  "/services",
  "/availability",
  "/staff",
  "/integrations",
  "/channels",
  "/conversations",
  "/settings",
  "/audit",
  "/usage",
  "/billing",
];

function isBackOffice(pathname: string) {
  return BACK_OFFICE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function isPublic(pathname: string) {
  return (
    pathname.startsWith("/book") ||
    pathname.startsWith("/api/trpc") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/integrations/google/callback") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-out") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding") ||
    pathname === "/"
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return; // let through

  if (isBackOffice(pathname)) {
    if (!req.auth?.user) {
      // Use nextUrl.clone() to avoid new URL() Edge runtime issues
      const url = req.nextUrl.clone();
      url.pathname = "/sign-in";
      url.searchParams.set("callbackUrl", req.nextUrl.href);
      return Response.redirect(url);
    }

    const activeTenant = req.cookies.get("active-tenant")?.value;
    if (!activeTenant) {
      const url = req.nextUrl.clone();
      url.pathname = "/onboarding";
      return Response.redirect(url);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
