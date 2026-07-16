-- Migration: Stripe Connect + per-booking payment support
-- Adds tenant Stripe Connect fields, booking payment status, and service payment toggle.

-- 1. Stripe Connect fields on tenants
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_onboarding_complete" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- 2. booking_payment_status enum
CREATE TYPE "public"."booking_payment_status" AS ENUM('unpaid', 'paid', 'refunded', 'waived');
--> statement-breakpoint

-- 3. Payment columns on bookings
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "payment_status" "booking_payment_status",
  ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
--> statement-breakpoint

-- 4. Partial index for fast lookup of unpaid bookings (used by webhook + expiry job)
CREATE INDEX IF NOT EXISTS "bookings_payment_status_idx"
  ON "bookings" ("tenant_id", "payment_status")
  WHERE "payment_status" = 'unpaid';
--> statement-breakpoint

-- 5. Unique index so a checkout session can only be linked to one booking
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_checkout_session_idx"
  ON "bookings" ("stripe_checkout_session_id")
  WHERE "stripe_checkout_session_id" IS NOT NULL;
--> statement-breakpoint

-- 6. requires_payment flag on services
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "requires_payment" boolean NOT NULL DEFAULT false;
