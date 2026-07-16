# Setup Guide

Step-by-step instructions for getting the booking-agent monorepo running locally.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| PostgreSQL | 16+ |
| Redis | 7+ (or Upstash free tier) |

---

## 1. Clone & install

```bash
git clone https://github.com/alvinpeck/bookingAgent.git
cd bookingAgent
pnpm install
```

---

## 2. Environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
```

Open `apps/web/.env.local` and fill in the following:

### Database (required)
```env
# Pooled connection — used at runtime
DATABASE_URL=postgresql://user:password@host:5432/booking_agent

# Direct (non-pooled) — used for migrations only
DATABASE_URL_DIRECT=postgresql://user:password@host:5432/booking_agent
```

Recommended providers: [Neon](https://neon.tech) (free tier) or [Supabase](https://supabase.com).

### Redis (required)
```env
REDIS_URL=redis://localhost:6379
```

Recommended: [Upstash](https://upstash.com) free tier for production.

### Auth (required)
```env
# Generate with: openssl rand -hex 32
AUTH_SECRET=your-32-char-random-secret-here

# Your local or production URL
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Secrets (required)
```env
# AES-256-GCM encryption key for stored API tokens
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# JWT secret for admin login (min 32 chars)
# Generate with: openssl rand -hex 32
JWT_SECRET=your-32-char-random-secret-here

# Bearer token for /api/cron/* routes
# Generate with: openssl rand -hex 32
CRON_SECRET=your-random-cron-secret-here
```

### Email — Resend (required for notifications)
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
```

Sign up at [resend.com](https://resend.com) — free tier includes 3,000 emails/month.

### Stripe (required for payments)
```env
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
```

### Google OAuth (optional — for calendar integration)
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

### Sentry (optional — error monitoring)
```env
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

---

## 3. Database setup

Run all migrations:

```bash
pnpm db:migrate
```

> If you ever change the schema, regenerate migration files first:
> ```bash
> pnpm db:generate
> pnpm db:migrate
> ```

Optional — open the Drizzle visual studio:

```bash
pnpm db:studio
```

---

## 4. Create a super-admin user

```bash
ADMIN_EMAIL=you@example.com \
ADMIN_PASSWORD=yourpassword \
ADMIN_NAME="Your Name" \
pnpm db:create-admin
```

Or set those as env vars in `.env.local` and just run:

```bash
pnpm db:create-admin
```

The admin panel is at `/admin` once the dev server is running.

---

## 5. Stripe webhook (local testing)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and forward events to your local server:

```bash
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
```

Copy the printed webhook signing secret into `STRIPE_WEBHOOK_SECRET` in `.env.local`.

---

## 6. Start the dev server

```bash
pnpm dev
```

App runs at **http://localhost:3000**.

> **Port conflict?** If 3000 is taken, Next.js will use 3001. Make sure `AUTH_URL` in `.env.local` matches the actual port.

---

## Key commands

```bash
pnpm dev              # start dev server (all packages)
pnpm build            # production build
pnpm typecheck        # TypeScript check across all packages
pnpm lint             # ESLint across all packages

pnpm db:generate      # generate Drizzle migration files from schema
pnpm db:migrate       # apply migrations to the database
pnpm db:seed          # seed development data
pnpm db:studio        # open Drizzle Studio (DB GUI)
pnpm db:create-admin  # create or update the super-admin user
```

---

## Project structure

```
booking-agent/
├── apps/
│   └── web/                    # Next.js 15 app (App Router)
│       ├── app/
│       │   ├── (auth)/         # Sign-in, sign-up, forgot/reset password
│       │   ├── (back-office)/  # Dashboard, bookings, services, settings
│       │   ├── admin/          # Super-admin panel
│       │   ├── book/           # Public booking flow
│       │   └── api/            # tRPC, webhooks, cron, integrations
│       └── scripts/
│           └── create-admin.ts
│
└── packages/
    ├── db/                     # Drizzle ORM schema + migrations
    └── trpc/                   # tRPC routers + middleware
```

---

## Branches

| Branch | Purpose |
|--------|---------|
| `main` | Production |
| `qa` | Staging / QA |
