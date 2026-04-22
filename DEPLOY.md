# Deploy to AWS Amplify — Step by Step

Stack: **AWS Amplify** (host) + **Supabase** (Postgres) + **Clerk** (auth)

---

## Step 1 — Push your code to GitHub

1. Create a new GitHub repository (public or private).
2. From your local machine:
   ```bash
   cd booking-agent
   git init
   git add .
   git commit -m "feat: phases 1-3 foundation"
   git remote add origin https://github.com/YOUR_USERNAME/booking-agent.git
   git push -u origin main
   ```

---

## Step 2 — Set up Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a region close to your users.
3. Once created, go to **Settings → Database**
4. Copy two connection strings:
   - **Connection pooling** (port 6543) → this is your `DATABASE_URL`
   - **Direct connection** (port 5432) → this is your `DATABASE_URL_DIRECT`

Both strings look like:
```
postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

---

## Step 3 — Set up Clerk

1. Go to [clerk.com](https://clerk.com) → **Create application**
2. Enable **Email + Password** sign-in.
3. Go to **Organizations** → enable Organizations (this is how tenants work).
4. Go to **API Keys** → copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

### Configure Clerk webhook (do this after Amplify deploy gives you a URL)
1. **Webhooks** → **Add endpoint**
2. URL: `https://YOUR_AMPLIFY_URL/api/webhooks/clerk`
3. Subscribe to:
   - `organization.created`
   - `organization.updated`
   - `organization.deleted`
   - `organizationMembership.created`
   - `organizationMembership.updated`
   - `organizationMembership.deleted`
4. Copy **Signing Secret** → this is `CLERK_WEBHOOK_SECRET`

### Enable MFA (recommended)
- Clerk Dashboard → **Organizations** → **Settings** → turn on **Require multi-factor**
- This enforces MFA for all admin/owner back-office users.

---

## Step 4 — Generate encryption key

Run this locally to generate a secure 32-byte key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output → this is your `ENCRYPTION_KEY`.

---

## Step 5 — Deploy on AWS Amplify

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. **New app** → **Host web app** → **GitHub**
3. Select your repository and `main` branch.
4. Amplify will detect `amplify.yml` automatically. No changes needed.
5. Click **Next** — do NOT deploy yet.

### Add environment variables (in Amplify → Environment variables):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled connection string (port 6543) |
| `DATABASE_URL_DIRECT` | Supabase direct connection string (port 5432) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk API Keys |
| `CLERK_SECRET_KEY` | From Clerk API Keys |
| `CLERK_WEBHOOK_SECRET` | From Clerk Webhooks (add after first deploy) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/onboarding` |
| `ENCRYPTION_KEY` | Generated in Step 4 |
| `NODE_ENV` | `production` |

6. Click **Save and deploy**.

---

## Step 6 — Run database migrations

Amplify doesn't run migrations automatically. Do this once from your local machine (pointing at Supabase):

```bash
# In your .env.local, set DATABASE_URL_DIRECT to Supabase direct URL
cd booking-agent
pnpm db:generate
pnpm db:migrate
```

Then apply custom constraints:
```bash
psql "YOUR_SUPABASE_DIRECT_URL" -f packages/db/src/migrations/custom/001_constraints.sql
```

You can get `psql` installed via:
- Mac: `brew install postgresql`
- Windows: download from postgresql.org

---

## Step 7 — Seed development data (optional)

```bash
pnpm db:seed
```

---

## Step 8 — Add Clerk webhook URL

After the Amplify deployment completes:
1. Copy your Amplify app URL (e.g. `https://main.d1234abc.amplifyapp.com`)
2. Go back to Clerk → Webhooks → update the endpoint URL
3. Copy the signing secret → add as `CLERK_WEBHOOK_SECRET` in Amplify environment variables
4. In Amplify, trigger a **Redeploy** so the new env var is picked up.

---

## Step 9 — Test the deployment

1. Visit `https://YOUR_AMPLIFY_URL/sign-up`
2. Create an account
3. You should be redirected to `/onboarding`
4. Create a workspace (business name + slug)
5. You should land on `/dashboard`
6. Check Supabase Table Editor → `tenants` and `tenant_users` should have new rows

---

## Troubleshooting

**Build fails with "pnpm not found"**
→ The `amplify.yml` installs pnpm in preBuild. Check the build logs for the exact error.

**"DATABASE_URL is not set"**
→ Confirm env vars are saved in Amplify Console → Environment variables. Re-deploy after adding them.

**Clerk webhook returns 500**
→ Check that `CLERK_WEBHOOK_SECRET` is set correctly. The svix signature check will fail if it's missing or wrong.

**Tenant row not created after sign-up**
→ The Clerk webhook needs to fire `organization.created`. Confirm the webhook endpoint URL is correct and the event is subscribed.

**Migrations fail**
→ Ensure you're using `DATABASE_URL_DIRECT` (port 5432, not pooler port 6543) for migrations.
