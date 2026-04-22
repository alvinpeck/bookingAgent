# Full AWS Deployment Guide
# RDS (PostgreSQL) + ElastiCache (Redis) + Amplify

## Architecture overview

```
Internet
    │
    ▼
AWS Amplify (managed, serverless)
    │  VPC link
    ▼
VPC (your private network)
├── Private Subnet A (ap-southeast-1a)  ← RDS primary
├── Private Subnet B (ap-southeast-1b)  ← RDS standby + ElastiCache
└── Public Subnet                       ← NAT Gateway (Amplify egress)

Security Groups
├── sg-amplify   → allows outbound to RDS + Redis
├── sg-rds       → allows inbound 5432 from sg-amplify only
└── sg-redis     → allows inbound 6379 from sg-amplify only
```

> All steps use the AWS Console. Region used in this guide: **ap-southeast-1 (Singapore)**.
> Swap for your preferred region throughout.

---

## PART 1 — VPC + Networking

### 1.1 Create VPC

1. AWS Console → **VPC** → **Your VPCs** → **Create VPC**
2. Settings:
   - Name: `booking-agent-vpc`
   - IPv4 CIDR: `10.0.0.0/16`
   - Tenancy: Default
3. Click **Create VPC**

---

### 1.2 Create Subnets

You need **2 private subnets** (for RDS multi-AZ + ElastiCache) and **1 public subnet** (for NAT).

**Private Subnet A**
- VPC: `booking-agent-vpc`
- Name: `booking-agent-private-a`
- Availability Zone: `ap-southeast-1a`
- IPv4 CIDR: `10.0.1.0/24`

**Private Subnet B**
- VPC: `booking-agent-vpc`
- Name: `booking-agent-private-b`
- Availability Zone: `ap-southeast-1b`
- IPv4 CIDR: `10.0.2.0/24`

**Public Subnet**
- VPC: `booking-agent-vpc`
- Name: `booking-agent-public`
- Availability Zone: `ap-southeast-1a`
- IPv4 CIDR: `10.0.0.0/24`

---

### 1.3 Internet Gateway + NAT Gateway

**Internet Gateway** (allows public subnet to reach internet):
1. VPC → **Internet Gateways** → **Create**
2. Name: `booking-agent-igw`
3. **Attach to VPC** → select `booking-agent-vpc`

**Elastic IP** (needed for NAT):
1. EC2 → **Elastic IPs** → **Allocate Elastic IP address** → Allocate
2. Note the Allocation ID

**NAT Gateway** (allows private subnets to reach internet for Amplify):
1. VPC → **NAT Gateways** → **Create NAT Gateway**
2. Subnet: `booking-agent-public`
3. Connectivity: Public
4. Elastic IP: select the one you just created
5. Name: `booking-agent-nat`
6. Create — wait ~2 minutes for it to become Available

---

### 1.4 Route Tables

**Public Route Table:**
1. VPC → **Route Tables** → **Create**
2. Name: `booking-agent-public-rt`, VPC: `booking-agent-vpc`
3. **Routes** tab → **Edit routes** → Add route:
   - Destination: `0.0.0.0/0` → Target: `booking-agent-igw`
4. **Subnet associations** → Associate `booking-agent-public`

**Private Route Table:**
1. Create route table: `booking-agent-private-rt`
2. **Routes** → Add route:
   - Destination: `0.0.0.0/0` → Target: `booking-agent-nat`
3. **Subnet associations** → Associate both `booking-agent-private-a` and `booking-agent-private-b`

---

### 1.5 Security Groups

Go to **VPC → Security Groups → Create security group** for each:

#### sg-amplify
- Name: `booking-agent-amplify`
- VPC: `booking-agent-vpc`
- Inbound: none (Amplify is serverless, no inbound needed)
- Outbound:
  - Type: All traffic → Destination: `0.0.0.0/0`

#### sg-rds
- Name: `booking-agent-rds`
- VPC: `booking-agent-vpc`
- Inbound:
  - Type: PostgreSQL (port 5432)
  - Source: **Custom** → select `booking-agent-amplify` security group
  - Description: "Amplify to RDS"
- Outbound: All traffic (default)

#### sg-redis
- Name: `booking-agent-redis`
- VPC: `booking-agent-vpc`
- Inbound:
  - Type: Custom TCP → Port 6379
  - Source: **Custom** → select `booking-agent-amplify` security group
  - Description: "Amplify to Redis"
- Outbound: All traffic (default)

> ⚠️ **Temporary:** For running migrations from your local machine, temporarily add an inbound rule to `sg-rds`:
> - Type: PostgreSQL → Source: **My IP**
> Remove this rule after migrations are complete.

---

## PART 2 — RDS PostgreSQL

### 2.1 Create Subnet Group

1. RDS → **Subnet groups** → **Create DB subnet group**
2. Name: `booking-agent-db-subnet-group`
3. VPC: `booking-agent-vpc`
4. Add subnets: select both `booking-agent-private-a` and `booking-agent-private-b`

---

### 2.2 Create RDS Instance

1. RDS → **Databases** → **Create database**
2. Settings:

| Setting | Value |
|---|---|
| Creation method | Standard create |
| Engine | PostgreSQL |
| Engine version | PostgreSQL 16.x (latest) |
| Template | Production (or Free tier for testing) |
| DB identifier | `booking-agent-db` |
| Master username | `booking_agent` |
| Master password | Generate a strong password — **save it now** |
| Instance class | `db.t4g.micro` (free tier) or `db.t4g.small` (prod) |
| Storage | 20 GB gp3, autoscaling enabled |
| Multi-AZ | Enabled (prod) / Disabled (dev/free tier) |
| VPC | `booking-agent-vpc` |
| Subnet group | `booking-agent-db-subnet-group` |
| Public access | **No** |
| VPC security group | Remove default → add `booking-agent-rds` |
| Database name | `booking_agent` |
| Backup retention | 7 days |

3. Click **Create database** — takes ~5 minutes.

4. Once created, go to the database → **Connectivity & security** tab
5. Copy the **Endpoint** (e.g. `booking-agent-db.xxxx.ap-southeast-1.rds.amazonaws.com`)

Your connection strings will be:
```
DATABASE_URL=postgresql://booking_agent:PASSWORD@ENDPOINT:5432/booking_agent?sslmode=require
DATABASE_URL_DIRECT=postgresql://booking_agent:PASSWORD@ENDPOINT:5432/booking_agent?sslmode=require
```
(For RDS, both URLs are the same — no pooler needed; RDS handles connections natively.)

---

## PART 3 — ElastiCache Redis

### 3.1 Create Subnet Group

1. ElastiCache → **Subnet groups** → **Create**
2. Name: `booking-agent-redis-subnet-group`
3. VPC: `booking-agent-vpc`
4. Add subnets: select both private subnets

---

### 3.2 Create Redis Cluster

1. ElastiCache → **Redis OSS caches** → **Create Redis OSS cache**
2. Settings:

| Setting | Value |
|---|---|
| Creation method | Easy create (or Design your own) |
| Cluster mode | Disabled (single node for now) |
| Name | `booking-agent-redis` |
| Node type | `cache.t4g.micro` (free tier eligible) |
| Replicas | 0 (dev) / 1 (prod) |
| Subnet group | `booking-agent-redis-subnet-group` |
| Security groups | `booking-agent-redis` |
| Encryption in transit (TLS) | **Enabled** |
| Encryption at rest | Enabled |

3. Create — takes ~3 minutes.
4. Once created, copy the **Primary endpoint**
   (e.g. `booking-agent-redis.xxxx.0001.apse1.cache.amazonaws.com:6379`)

Your Redis URL:
```
REDIS_URL=rediss://booking-agent-redis.xxxx.0001.apse1.cache.amazonaws.com:6379
```
Note: `rediss://` (double-s) = TLS. Required for ElastiCache with encryption enabled.

---

## PART 4 — AWS Amplify

### 4.1 Connect GitHub repo

1. AWS Amplify → **Create new app** → **Host web app**
2. Provider: GitHub → Connect → Authorize
3. Select your repository + `main` branch
4. Amplify detects `amplify.yml` automatically

---

### 4.2 Configure VPC access

Amplify needs VPC access to reach RDS and ElastiCache (both in private subnets).

1. In Amplify → your app → **Hosting** → **Environment variables** (do this AFTER the app is created)
2. Go to **App settings** → **General** → scroll to **VPC configuration**
3. Click **Edit**:
   - VPC: `booking-agent-vpc`
   - Subnets: select both **private** subnets
   - Security groups: select `booking-agent-amplify`
4. Save

> Amplify with VPC enabled routes all serverless function traffic through your VPC via ENIs.
> This allows your Next.js API routes to reach RDS + Redis on private IPs.

---

### 4.3 Set environment variables

Amplify → **App settings** → **Environment variables** → **Manage variables**:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://booking_agent:PASSWORD@RDS_ENDPOINT:5432/booking_agent?sslmode=require` |
| `DATABASE_URL_DIRECT` | Same as above |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk |
| `CLERK_SECRET_KEY` | From Clerk |
| `CLERK_WEBHOOK_SECRET` | From Clerk (add after first deploy) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/onboarding` |
| `REDIS_URL` | `rediss://REDIS_ENDPOINT:6379` |
| `ENCRYPTION_KEY` | 64-char hex (run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_APP_URL` | Your Amplify URL (update after first deploy) |

Click **Save** → **Redeploy this version**

---

## PART 5 — Database migrations

Since RDS is in a private subnet, you need to temporarily allow your local IP to connect.

### 5.1 Temporarily open RDS to your IP

1. EC2 → **Security Groups** → `booking-agent-rds`
2. **Inbound rules** → **Edit** → **Add rule**:
   - Type: PostgreSQL
   - Source: **My IP**
3. Save

### 5.2 Run migrations from your local machine

```bash
# In your .env.local, set both DATABASE_URL and DATABASE_URL_DIRECT
# to the RDS endpoint with your credentials

cd booking-agent
pnpm db:generate
pnpm db:migrate
```

Apply custom constraints:
```bash
psql "postgresql://booking_agent:PASSWORD@RDS_ENDPOINT:5432/booking_agent?sslmode=require" \
  -f packages/db/src/migrations/custom/001_constraints.sql
```

### 5.3 Remove local IP rule (important!)

1. Go back to `booking-agent-rds` security group
2. Delete the "My IP" inbound rule
3. Save

RDS is now only accessible from Amplify via the VPC.

---

## PART 6 — Clerk webhook

After Amplify gives you a URL (e.g. `https://main.d1234.amplifyapp.com`):

1. Clerk Dashboard → **Webhooks** → **Add endpoint**
2. URL: `https://main.d1234.amplifyapp.com/api/webhooks/clerk`
3. Subscribe to:
   - `organization.created` / `.updated` / `.deleted`
   - `organizationMembership.created` / `.updated` / `.deleted`
4. Copy **Signing Secret** → add as `CLERK_WEBHOOK_SECRET` in Amplify env vars
5. Amplify → **Redeploy**

---

## PART 7 — Verify deployment

1. Visit `https://YOUR_AMPLIFY_URL/sign-up`
2. Create account → onboarding → create workspace
3. Check RDS: connect locally (temporarily re-open SG) and run:
   ```sql
   SELECT * FROM tenants;
   SELECT * FROM tenant_users;
   ```
4. You should see your new tenant and user rows.

---

## Monthly cost estimate (ap-southeast-1)

| Service | Spec | Est. cost/month |
|---|---|---|
| Amplify | ~1M requests | ~$5–15 |
| RDS PostgreSQL | db.t4g.micro, 20GB | ~$15–25 |
| ElastiCache Redis | cache.t4g.micro | ~$12–18 |
| NAT Gateway | ~10GB/month | ~$5–10 |
| Data transfer | ~10GB | ~$1–5 |
| **Total** | | **~$38–73/month** |

> Free tier: RDS db.t4g.micro and ElastiCache cache.t4g.micro are both free tier eligible
> for 12 months on a new AWS account, reducing cost to ~$10–20/month.

---

## Troubleshooting

**Amplify build times out connecting to DB**
→ VPC configuration not saved. Check App settings → General → VPC configuration.
→ Verify the private subnets are selected (not public).
→ Verify `booking-agent-amplify` SG is assigned.

**"connection refused" on port 5432**
→ Check `booking-agent-rds` inbound rule allows `booking-agent-amplify` SG on port 5432.
→ Confirm RDS instance is in `booking-agent-db-subnet-group` (private subnets).

**Redis TLS error**
→ Use `rediss://` (double-s) in REDIS_URL.
→ Confirm ElastiCache has "Encryption in transit" enabled.

**Migrations fail from local**
→ Confirm you temporarily added "My IP" to `booking-agent-rds` inbound rules.
→ Confirm `sslmode=require` is in the connection string.
