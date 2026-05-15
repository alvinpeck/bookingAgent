"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./client";

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data stays "fresh" for 2 min — no re-fetch while navigating between pages
            staleTime: 2 * 60 * 1000,
            // Keep unused data in cache for 10 min so navigating back is instant
            gcTime: 10 * 60 * 1000,
            // Never refetch just because the user switched browser tabs or clicked back in.
            // This is the single biggest source of perceived lag in back-office apps.
            refetchOnWindowFocus: false,
            // Only reconnect-refetch in production — dev HMR triggers spurious reconnects
            refetchOnReconnect: process.env.NODE_ENV === "production",
            retry: (failureCount, error) => {
              // Don't retry on 4xx errors — they won't fix themselves
              if (
                error instanceof Error &&
                "data" in error &&
                typeof (error as { data?: { httpStatus?: number } }).data?.httpStatus === "number" &&
                (error as { data: { httpStatus: number } }).data.httpStatus >= 400 &&
                (error as { data: { httpStatus: number } }).data.httpStatus < 500
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transformer: superjson as any,
          // Batch window: collect all queries fired in the same JS tick into one
          // HTTP request. Default is already enabled; explicit for clarity.
          maxURLLength: 2083,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
