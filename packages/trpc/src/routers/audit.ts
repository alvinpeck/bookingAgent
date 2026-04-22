import { z } from "zod";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  router,
  viewAuditLogsProcedure,
} from "../trpc";
import { auditLogs, auditActionEnum } from "@booking-agent/db";

export const auditRouter = router({
  /**
   * Paginated audit log viewer.
   * Only accessible to users with viewAuditLogs permission (owner, admin).
   */
  list: viewAuditLogsProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        action: z.enum(auditActionEnum.enumValues).optional(),
        actorId: z.string().optional(),
        resourceType: z.string().optional(),
        resourceId: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(auditLogs.tenantId, ctx.tenant.id)];

      if (input.action) conditions.push(eq(auditLogs.action, input.action));
      if (input.actorId) conditions.push(eq(auditLogs.actorId, input.actorId));
      if (input.resourceType) conditions.push(eq(auditLogs.resourceType, input.resourceType));
      if (input.resourceId) conditions.push(eq(auditLogs.resourceId, input.resourceId));
      if (input.from) conditions.push(gte(auditLogs.createdAt, new Date(input.from)));
      if (input.to) conditions.push(lte(auditLogs.createdAt, new Date(input.to)));

      const offset = (input.page - 1) * input.pageSize;

      const [rows, countResult] = await Promise.all([
        ctx.db.query.auditLogs.findMany({
          where: and(...conditions),
          orderBy: (a, { desc }) => desc(a.createdAt),
          limit: input.pageSize,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(auditLogs)
          .where(and(...conditions)),
      ]);

      return {
        data: rows,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),
});
