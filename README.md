# booking-agent

Multi-tenant AI-powered booking SaaS.  
**Phase 1–2 complete:** Foundation, schema, auth, RBAC, tRPC backend.

---

## Architecture

```
booking-agent/
├── apps/
│   └── web/                         # Next.js 15 app (App Router)
│       ├── app/
│       │   ├── api/
│       │   │   ├── trpc/[trpc]/     # tRPC HTTP handler
│       │   │   └── webhooks/clerk/  # Clerk org/user sync
│       │   ├── (auth)/              # Sign-in, sign-up pages
│       │   ├── (back-office)/       # Dashboard, bookings, settings [Phase 7]
│       │   └── (booking)/           # Public booking site [Phase 8]
│       ├── lib/trpc/
│       │   ├── client.ts            # React Query client
│       │   ├── provider.tsx         # TRPCProvider wrapper
│       │   └── server.ts            # Server Component caller
│       └── middleware.ts            # Clerk auth + route protection
│
└── packages/
    ├── db/                          # Drizzle ORM + PostgreSQL schema
    │   └── src/
    │       ├── client.ts            # DB singleton
    │       ├── schema/              # All table definitions
    │       │   ├── tenants.ts       # Tenants, plans, settings
    │       │   ├── users.ts         # TenantUsers, RBAC roles
    │       │   ├── services.ts      # Services, Staff, ServiceStaff
    │       │   ├── availability.ts  # Rules, overrides, slot holds
    │       │   ├── bookings.ts      # Bookings, status history
    │       │   ├── channels.ts      # Channels, conversations
    │       │   ├── integrations.ts  # OAuth tokens, webhook events
    │       │   └── audit.ts         # Audit logs, usage metering
    │       ├── migrations/
    │       │   └── custom/001_constraints.sql  # Partial indexes, RLS, rules
    │       └── seed.ts              # Dev seed data
    │
    └── trpc/                        # tRPC routers + middleware
        └── src/
            ├── context.ts           # Request context (tenant derived from Clerk)
            ├── trpc.ts              # Base procedures, RBAC middleware, audit helper
            ├── routers/
            │   ├── index.ts         # Root appRouter
            │   ├── tenant.ts        # Tenant profile + settings
            │   ├── staff.ts         # Staff + user management
            │   ├── services.ts      # Bookable services CRUD
            │   ├── availability.ts  # Rules, overrides, slot holds
            │   ├── bookings.ts      # Create, cancel, reschedule
            │   └── audit.ts         # Audit log viewer
            └── __tests__/
                └── tenant-isolation.test.ts
```

---

## Tech stack

| Layer       | Choice                      |
|-------------|-----------------------------|
| Framework   | Next.js 15 (App Router)     |
| Language    | TypeScript (strict)         |
| Auth        | Clerk (orgs = tenants)      |
| API         | tRPC v11 + superjson        |
| ORM         | Drizzle ORM                 |
| Database    | PostgreSQL                  |
| Monorepo    | Turborepo + pnpm workspaces |

---

## Security design

| Principle | Implementation |
|---|---|
| Tenant isolation | `tenantId` always derived from Clerk `orgId`, never from client input |
| RBAC | Permission matrix in `schema/users.ts`; enforced via `requirePermission()` middleware |
| Audit logging | Every write procedure calls `ctx.audit()`; failures don't crash the request |
| Append-only audit log | DB-level RULE prevents UPDATE/DELETE on `audit_logs` |
| Double-booking | `SELECT FOR UPDATE` in transaction + partial unique index on `(staff_id, starts_at)` |
| Slot hold | Short-lived hold tokens expire in 5 min; consumed atomically at booking creation |
| OAuth tokens | Stored AES-256-GCM encrypted; never logged or exposed to frontend |
| Webhook HMAC | Clerk webhooks verified with svix; WhatsApp/Telegram verified in Phase 9 |

---

## Getting started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 16+
- A Clerk account (free tier is fine)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in: DATABASE_URL, DATABASE_URL_DIRECT, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
```

### 3. Run database migrations

```bash
pnpm db:generate   # generate migration files from schema
pnpm db:migrate    # apply migrations to the database
```

### 4. Apply custom constraints

```bash
psql $DATABASE_URL_DIRECT -f packages/db/src/migrations/custom/001_constraints.sql
```

### 5. Seed development data

```bash
pnpm db:seed
```

### 6. Start development server

```bash
pnpm dev
```

### 7. Configure Clerk webhook

In your Clerk dashboard:
1. Go to **Webhooks** → **Add endpoint**
2. URL: `https://your-domain.com/api/webhooks/clerk`
3. Subscribe to events:
   - `organization.created`
   - `organization.updated`
   - `organization.deleted`
   - `organizationMembership.created`
   - `organizationMembership.updated`
   - `organizationMembership.deleted`
4. Copy the **Signing Secret** to `CLERK_WEBHOOK_SECRET` in `.env.local`

---

## Completed phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ | Tenant model, plans, quota constants |
| 2 | ✅ | Multi-tenant backend, RBAC, audit logging, tRPC routers |

## Remaining phases

| Phase | Description |
|-------|-------------|
| 3 | Auth pages (Clerk UI), MFA config, session management |
| 4 | DB migration files (auto-generated by `pnpm db:generate`) |
| 5 | Slot generation engine (available slots from rules + overrides) |
| 6 | Google Calendar OAuth + free/busy sync |
| 7 | Back-office UI (dashboard, calendar, bookings table) |
| 8 | Public booking site (service picker, slot picker, form) |
| 9 | WhatsApp + Telegram webhook handlers + message normalisation |
| 10 | AI booking agent (Vercel AI SDK + restricted tools) |
| 11 | Billing metering + quota enforcement |
| 12 | DevOps: CI/CD, observability, backup |
| 13 | Compliance: retention, DPA, privacy policy |

---

## Key commands

```bash
pnpm dev              # start Next.js dev server
pnpm build            # production build
pnpm typecheck        # run TypeScript across all packages
pnpm lint             # run ESLint across all packages
pnpm db:generate      # generate Drizzle migration files
pnpm db:migrate       # apply migrations
pnpm db:seed          # seed dev data
pnpm db:studio        # open Drizzle Studio (DB GUI)
```

---

## Adding a new tRPC router

1. Create `packages/trpc/src/routers/my-feature.ts`
2. Export from `packages/trpc/src/routers/index.ts`:
   ```ts
   import { myFeatureRouter } from "./my-feature";
   export const appRouter = router({
     ...
     myFeature: myFeatureRouter,
   });
   ```
3. TypeScript and the client auto-update — no codegen needed.
