-- TRD §4.5: a slot may hold at most one appointment in the `booked` state.
-- Cancelled, completed and no-show appointments must be able to share a
-- timestamp with a new booking, so the constraint is partial. The Prisma schema
-- DSL cannot express a partial unique index, hence this hand-written migration.
--
-- This is the database-level backstop; the booking transaction (Phase 2) also
-- takes an advisory lock keyed on the slot so the common path returns a clean
-- 409 rather than a constraint violation.
CREATE UNIQUE INDEX "appointments_scheduled_at_booked_key"
  ON "appointments" ("scheduled_at")
  WHERE "status" = 'booked';
