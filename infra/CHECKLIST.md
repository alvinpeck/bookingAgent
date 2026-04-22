# AWS Infrastructure Checklist

Use this alongside DEPLOY_AWS_FULL.md. Check off each item as you complete it.

## VPC + Networking
- [ ] VPC created: `booking-agent-vpc` (10.0.0.0/16)
- [ ] Private Subnet A: `10.0.1.0/24` (ap-southeast-1a)
- [ ] Private Subnet B: `10.0.2.0/24` (ap-southeast-1b)
- [ ] Public Subnet:   `10.0.0.0/24` (ap-southeast-1a)
- [ ] Internet Gateway created + attached to VPC
- [ ] Elastic IP allocated
- [ ] NAT Gateway created in public subnet (status: Available)
- [ ] Public route table → 0.0.0.0/0 → IGW
- [ ] Private route table → 0.0.0.0/0 → NAT → both private subnets associated

## Security Groups
- [ ] `booking-agent-amplify` — outbound all traffic
- [ ] `booking-agent-rds`    — inbound 5432 from booking-agent-amplify
- [ ] `booking-agent-redis`  — inbound 6379 from booking-agent-amplify

## RDS
- [ ] DB subnet group created with both private subnets
- [ ] RDS PostgreSQL 16 created (no public access)
- [ ] Endpoint copied: `____________________________`
- [ ] Password saved securely
- [ ] DATABASE_URL built: `postgresql://booking_agent:PWD@ENDPOINT:5432/booking_agent?sslmode=require`

## ElastiCache
- [ ] Redis subnet group created with both private subnets
- [ ] Redis cluster created (TLS enabled)
- [ ] Primary endpoint copied: `____________________________`
- [ ] REDIS_URL built: `rediss://ENDPOINT:6379`

## Amplify
- [ ] App created + connected to GitHub repo
- [ ] VPC configuration set (private subnets + booking-agent-amplify SG)
- [ ] All environment variables added (see DEPLOY_AWS_FULL.md Part 4.3)
- [ ] First deploy completed (green)
- [ ] Amplify URL noted: `____________________________`

## Clerk Webhook
- [ ] Webhook endpoint added in Clerk: `https://AMPLIFY_URL/api/webhooks/clerk`
- [ ] All 6 org/membership events subscribed
- [ ] CLERK_WEBHOOK_SECRET added to Amplify env vars
- [ ] Redeployed after adding webhook secret

## Database Migrations
- [ ] Temporarily added "My IP" to booking-agent-rds inbound
- [ ] `pnpm db:generate` run locally
- [ ] `pnpm db:migrate` run locally (pointing at RDS)
- [ ] `001_constraints.sql` applied via psql
- [ ] "My IP" inbound rule REMOVED from booking-agent-rds

## Smoke Test
- [ ] Sign up at `/sign-up` → lands on `/onboarding`
- [ ] Create workspace → lands on `/dashboard`
- [ ] Tenants row visible in RDS
- [ ] TenantUsers row visible in RDS
