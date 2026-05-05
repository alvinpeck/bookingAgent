/**
 * Schema barrel — re-exports every table so Drizzle Kit can find them all
 * and so app code has a single import point.
 *
 * Import pattern in application code:
 *   import { bookings, tenants, staff } from "@booking-agent/db";
 */

export * from "./tenants";
export * from "./users";
export * from "./services";
export * from "./availability";
export * from "./bookings";
export * from "./channels";
export * from "./integrations";
export * from "./audit";
export * from "./relations";
