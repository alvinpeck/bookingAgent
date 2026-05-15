import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@booking-agent/trpc";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { verifyImpersonateJwt, IMPERSONATE_COOKIE } from "@/lib/admin-auth";

async function handler(req: NextRequest) {
  const session      = await auth();
  let userId         = session?.user?.id ?? null;
  let activeTenantId = req.cookies.get("active-tenant")?.value ?? null;

  // Impersonation always takes priority over any existing NextAuth session —
  // this ensures all tRPC calls inside the portal use the correct tenant context.
  const impToken = req.cookies.get(IMPERSONATE_COOKIE)?.value;
  if (impToken) {
    const imp = verifyImpersonateJwt(impToken);
    if (imp) {
      userId         = imp.virtualUserId;
      activeTenantId = imp.tenantId;   // always use the signed tenantId, not the cookie
    }
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,                      // pass the original request — never copy it (body stream)
    router: appRouter,
    // Inject auth data via closure instead of cloned headers
    createContext: (opts) =>
      createTRPCContext(opts, { userId, tenantId: activeTenantId }),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`[tRPC] Error on /${path ?? "<no-path>"}:`, error);
          }
        : undefined,
  });
}

export { handler as GET, handler as POST };
