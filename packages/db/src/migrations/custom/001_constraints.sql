-- ============================================================
-- Custom migration: run AFTER `pnpm db:migrate`
-- File: packages/db/src/migrations/custom/001_constraints.sql
-- ============================================================

-- ── Double-booking prevention ─────────────────────────────────────────────────
-- Drizzle does not support partial indexes natively.
-- This index is the last line of defence against concurrent double-bookings.
-- It prevents two confirmed/pending bookings for the same staff at the same start time.

CREATE UNIQUE INDEX IF NOT EXISTS bookings_no_double_booking_idx
  ON bookings (staff_id, starts_at)
  WHERE status NOT IN ('cancelled', 'rescheduled');


-- ── Audit log append-only enforcement ────────────────────────────────────────
-- Prevent UPDATE and DELETE on audit_logs at the DB layer.
-- Even if application code has a bug, this prevents accidental mutation.

CREATE OR REPLACE RULE audit_logs_no_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;

CREATE OR REPLACE RULE audit_logs_no_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;


-- ── Row-level security (optional but recommended for growth/enterprise tiers) ──
-- Enable RLS on all tenant-scoped tables.
-- Application connects as a role that has a tenant_id session variable set.
-- Uncomment and adapt once you have a dedicated application DB role.

-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON bookings
--   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ALTER TABLE services ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON services
--   USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- (repeat for: staff, availability_rules, availability_overrides,
--  slot_holds, tenant_users, channels, conversations, integrations,
--  webhook_events, audit_logs, usage_metering, tenant_settings)


-- ── Indexes for booking reminder job ─────────────────────────────────────────
-- Allows the reminder worker to efficiently query upcoming unreminded bookings.

CREATE INDEX IF NOT EXISTS bookings_reminder_idx
  ON bookings (tenant_id, reminder_scheduled_for)
  WHERE reminder_sent_at IS NULL
    AND status = 'confirmed';
