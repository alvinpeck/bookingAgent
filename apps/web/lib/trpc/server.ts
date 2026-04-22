import "server-only";

import { createTRPCContext, appRouter } from "@booking-agent/trpc";
import { createCallerFactory } from "@trpc/server";
import { cache } from "react";

/**
 * Server-side tRPC caller.
 * Use this in Server Components and Route Handlers to call procedures
 * without an HTTP round-trip.
 *
 * Usage in a Server Component:
 *   import { api } from "@/lib/trpc/server";
 *   const bookings = await api.bookings.list({ page: 1, pageSize: 10 });
 *
 * The context is created once per request using React's `cache()`.
 */

const createContext = cache(async () => {
  // For server-side calls we construct a minimal Request object
  const req = new Request("http://internal-server-call", {
    headers: new Headers(),
  });

  return createTRPCContext({ req, resHeaders: new Headers() });
});

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext);
