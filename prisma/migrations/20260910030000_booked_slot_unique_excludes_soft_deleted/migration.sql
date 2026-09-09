-- Narrows the booked-slot uniqueness constraint to exclude soft-deleted rows.
--
-- The original predicate (`WHERE status = 'booked'`) followed TRD §4.5 literally
-- and ignored `deleted_at`. Soft-deleting an appointment does not change its
-- status, so a deleted-but-still-`booked` row kept holding its slot: the row is
-- invisible to every query the soft-delete extension filters, yet the slot could
-- never be rebooked. A silent, undiagnosable outage.
--
-- Enforcing this in the predicate rather than by also transitioning status on
-- delete keeps the guarantee at the database level, where it holds regardless of
-- whether a future write path remembers the invariant — the soft-delete client
-- extension cannot intercept single-row updates, so application discipline alone
-- is not a sufficient guard here.
DROP INDEX "appointments_scheduled_at_booked_key";

CREATE UNIQUE INDEX "appointments_scheduled_at_booked_key"
  ON "appointments" ("scheduled_at")
  WHERE "status" = 'booked' AND "deleted_at" IS NULL;
