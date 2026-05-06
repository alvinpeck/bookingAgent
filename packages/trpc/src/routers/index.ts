import { router } from "../trpc";
import { tenantRouter } from "./tenant";
import { staffRouter } from "./staff";
import { servicesRouter } from "./services";
import { availabilityRouter } from "./availability";
import { bookingsRouter } from "./bookings";
import { auditRouter } from "./audit";
import { channelsRouter } from "./channels";
import { integrationsRouter } from "./integrations";
import { billingRouter } from "./billing";
import { complianceRouter } from "./compliance";
import { adminRouter } from "./admin";

/**
 * Root application router.
 *
 * Add new routers here as phases are completed:
 *   - integrationsRouter (Phase 6 — Google Calendar)
 *   - agentRouter        (Phase 10 — AI booking agent)
 *   - billingRouter      (Phase 11 — metering, quotas)
 *   - complianceRouter   (Phase 13 — GDPR / data retention)
 */
export const appRouter = router({
  tenant: tenantRouter,
  staff: staffRouter,
  services: servicesRouter,
  availability: availabilityRouter,
  bookings: bookingsRouter,
  audit: auditRouter,
  channels: channelsRouter,
  integrations: integrationsRouter,
  billing: billingRouter,
  compliance: complianceRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
