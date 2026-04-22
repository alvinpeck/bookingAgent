"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@booking-agent/trpc";

/**
 * tRPC React client.
 *
 * Usage in Client Components:
 *   import { trpc } from "@/lib/trpc/client";
 *   const { data } = trpc.bookings.list.useQuery({ page: 1, pageSize: 25 });
 */
export const trpc = createTRPCReact<AppRouter>();
