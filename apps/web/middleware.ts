import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─── Route matchers ───────────────────────────────────────────────────────────

// Back-office routes that require authentication
const isBackOfficeRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/bookings(.*)",
  "/services(.*)",
  "/availability(.*)",
  "/staff(.*)",
  "/integrations(.*)",
  "/channels(.*)",
  "/settings(.*)",
  "/audit(.*)",
]);

// Public booking site routes (no auth required)
const isPublicBookingRoute = createRouteMatcher([
  "/book(.*)",
  "/api/trpc(.*)", // tRPC handles its own auth internally
  "/api/webhooks(.*)",
  "/api/integrations/google/callback",
]);

// ─── Middleware ───────────────────────────────────────────────────────────────

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Allow public booking and webhook routes through
  if (isPublicBookingRoute(req)) {
    return NextResponse.next();
  }

  // Protect all back-office routes
  if (isBackOfficeRoute(req)) {
    const { userId, orgId } = await auth();

    if (!userId) {
      // Redirect to sign-in, preserving the intended destination
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }

    // Require an active org to be selected (tenant context)
    if (!orgId) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
