# booking-agent

Multi-tenant AI-powered booking SaaS. Tenants get a branded public booking page, a back-office dashboard, and an AI agent that handles bookings via WhatsApp, Telegram, and web chat.

---

## Architecture

```
booking-agent/
├── apps/
│   └── web/                              # Next.js 15 app (App Router)
│       ├── app/
│       │   ├── (auth)/                   # Sign-in, sign-up, forgot/reset password
│       │   ├── (back-office)/            # Tenant dashboard (protected)
│       │   │   ├── agent/                # AI agent settings
│       │   │   ├── audit/                # Audit log viewer
│       │   │   ├── availability/         # Availability rules & overrides
│       │   │   ├── billing/              # Plan & usage
│       │   │   ├── bookings/             # Booking list + detail view
│       │   │   ├── channels/             # WhatsApp / Telegram channels
│       │   │   ├── conversations/        # Inbox
│       │   │   ├── dashboard/            # Overview
│       │   │   ├── integrations/         # Google Calendar OAuth
│       │   │   ├── services/             # Bookable services CRUD
│       │   │   ├── settings/             # Tenant profile, Stripe Connect, API keys
│       │   │   ├── staff/                # Staff management
│       │   │   └── usage/                # Quota usage
│       │   ├── admin/                    # Super-admin panel (separate auth)
│       │   │   └── (protected)/tenants/  # Tenant list, impersonation
│       │   ├── book/[slug]/[serviceSlug] # Public booking flow
│       │   │   └── success/              # Post-payment confirmation
│       │   ├── book/cancel/[bookingId]   # Customer self-service cancellation
│       │   ├── invite/[token]            # Team invite acceptance
│       │   ├── onboarding/               # New tenant onboarding
│       │   ├── privacy/                  # Privacy policy
│       │   └── terms/                    # Terms of service
│       │
│       └── app/api/
│           ├── auth/                     # NextAuth + register + forgot/reset password
│           ├── admin/auth/               # Super-admin login / logout / portal switch
│           ├── cron/                     # Booking reminders, data retention
│           ├── integrations/google/      # Google Calendar OAuth callback
│           ├── invite/[token]/accept     # Invite token acceptance
│           ├── trpc/[trpc]/              # tRPC HTTP handler
│           ├── webhooks/stripe/          # Stripe payment events
│           ├── webhooks/telegram/        # Telegram bot webhooks
│           ├── webhooks/whatsapp/        # WhatsApp webhooks
│           └── workspaces/               # Workspace create / switch
│
└── packages/
    ├── db/                               # Drizzle ORM + PostgreSQL schema
    │   └── src/
    │       ├── client.ts                 # DB singleton (Neon serverless driver)
    │       ├── redis.ts                  # Redis singleton (ioredis)
    │       ├── schema/
    │       │   ├── admin.ts              # Super-admin users
    │       │   ├── audit.ts              # Audit logs (append-only)
    │       │   ├── auth-schema.ts        # NextAuth tables
    │       │   ├── availability.ts       # Rules, overrides, slot holds
    │       │   ├── bookings.ts           # Bookings + payment status
    │       │   ├── channels.ts           # Messaging channels
    │       │   ├── integrations.ts       # OAuth tokens, webhook events
    │       │   ├── invites.ts            # Team invite tokens
    │       │   ├── services.ts           # Bookable services
    │       │   ├── tenants.ts            # Tenants, plans, Stripe Connect
    │       │   └── users.ts              # Users, RBAC roles
    │       └── migrations/               # Drizzle migration files
    │
    └── trpc/                             # tRPC routers + shared libs
        └── src/
            ├── context.ts                # Request context (tenant from session)
            ├── trpc.ts                   # Base procedures, RBAC middleware, audit helper
            ├── routers/
            │   ├── admin.ts              # Super-admin: tenant ops, impersonation
            │   ├── audit.ts              # Audit log queries
            │   ├── availability.ts       # Rules, overrides, slot engine, holiday import
            │   ├── billing.ts            # Plans, quota enforcement
            │   ├── bookings.ts           # Create, confirm, cancel, Stripe Checkout
            │   ├── channels.ts           # Channel CRUD + webhook registration
            │   ├── compliance.ts         # GDPR data export / deletion
            │   ├── conversations.ts      # Inbox + message handling
            │   ├── integrations.ts       # Google Calendar connect / sync
            │   ├── services.ts           # Service CRUD
            │   ├── staff.ts              # Staff + user management
            │   └── tenant.ts             # Tenant profile, settings, Stripe Connect
            └── lib/
                ├── agent.ts              # AI booking agent (Vercel AI SDK)
                ├── crypto.ts             # AES-256-GCM encryption for stored tokens
                ├── email/                # Transactional email (Resend)
                ├── google-calendar.ts    # Google Calendar free/busy sync
                ├── sms.ts                # SMS reminders
                ├── stripe.ts             # Stripe helpers
                └── usage.ts              # Quota metering (Redis counters)
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Auth | NextAuth v5 (beta) + Drizzle adapter |
| API | tRPC v11 + superjson |
| ORM | Drizzle ORM 0.38 |
| Database | PostgreSQL (Neon recommended) |
| Cache / queues | Redis (Upstash recommended) |
| AI | Vercel AI SDK — Anthropic, OpenAI, Google, Groq |
| Payments | Stripe Checkout + Stripe Connect |
| Email | Resend |
| Messaging | WhatsApp Cloud API, Telegram Bot API |
| Calendar | Google Calendar API |
| UI | React 19, Tailwind CSS v4 |
| Monorepo | Turborepo + pnpm workspaces |
| Error tracking | Sentry |

---

## Security design

| Principle | Implementation |
|---|---|
| Tenant isolation | `tenantId` always derived from the authenticated session, never from client input |
| RBAC | Permission matrix in `schema/users.ts`; enforced via `requirePermission()` middleware |
| Audit logging | Every write procedure calls `ctx.audit()`; failures don't crash the request |
| Append-only audit log | DB-level rule prevents UPDATE/DELETE on `audit_logs` |
| Double-booking prevention | `SELECT FOR UPDATE` in transaction + partial unique index on `(staff_id, starts_at)` |
| Slot holds | Short-lived hold tokens expire in 5 min; consumed atomically at booking creation |
| OAuth tokens | Stored AES-256-GCM encrypted; never logged or exposed to the frontend |
| Stripe webhook | Signature verified with `stripe.webhooks.constructEvent` |
| WhatsApp / Telegram webhooks | HMAC-verified per provider spec |
| Cross-tenant IDOR | Public booking flow validates `tenant.slug` + `service.tenantId` match |
| Admin impersonation | Short-lived signed JWT; full audit trail |

---

## Getting started

See **[SETUP.md](./SETUP.md)** for the full step-by-step guide.

Quick start:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# fill in .env.local …
pnpm db:migrate
pnpm db:create-admin
pnpm dev
```

App runs at **http://localhost:3000**.

---

## Key commands

```bash
pnpm dev              # start dev server (all packages)
pnpm build            # production build
pnpm typecheck        # TypeScript check across all packages
pnpm lint             # ESLint across all packages

pnpm db:generate      # generate Drizzle migration files from schema changes
pnpm db:migrate       # apply migrations to the database
pnpm db:seed          # seed development data
pnpm db:studio        # open Drizzle Studio (DB GUI)
pnpm db:create-admin  # create or update the super-admin user
```

---

## Feature status

| Feature | Status |
|---|---|
| Multi-tenant foundation (schema, RBAC, audit) | ✅ |
| Authentication (NextAuth v5, email+password, invite flow) | ✅ |
| Back-office dashboard, bookings, services, staff | ✅ |
| Availability rules, overrides, slot engine, holiday import | ✅ |
| Public booking flow (service picker → slot picker → form) | ✅ |
| Stripe Checkout + Stripe Connect for tenant payouts | ✅ |
| Customer self-service cancellation | ✅ |
| Booking reminders (email + SMS) | ✅ |
| Google Calendar integration (OAuth + free/busy sync) | ✅ |
| WhatsApp + Telegram webhook handlers | ✅ |
| Conversation inbox | ✅ |
| AI booking agent (Vercel AI SDK, multi-provider) | ✅ |
| Super-admin panel + tenant impersonation | ✅ |
| Billing, quota metering | ✅ |
| GDPR compliance (data export / deletion) | ✅ |
| SMS reminders | ✅ |

---

## Branches

| Branch | Purpose |
|---|---|
| `main` | Production |
| `qa` | Staging / QA |

---

## Adding a new tRPC router

1. Create `packages/trpc/src/routers/my-feature.ts`
2. Register it in `packages/trpc/src/routers/index.ts`:
   ```ts
   import { myFeatureRouter } from "./my-feature";
   export const appRouter = router({
     ...
     myFeature: myFeatureRouter,
   });
   ```
3. TypeScript and the React Query client update automatically — no codegen needed.
