-- Migration: Drop clerk_org_id column from tenants table
-- Clerk has been replaced by NextAuth; this column is no longer used.

DROP INDEX IF EXISTS "tenants_clerk_org_id_idx";--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "clerk_org_id";
