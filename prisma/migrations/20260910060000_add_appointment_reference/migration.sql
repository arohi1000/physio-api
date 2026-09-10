-- Adds a human-facing booking reference to `appointments`.
--
-- Not part of the TRD §4.5 table — M2-CONTRACT.md §2 fixes
-- `"reference": "PH-2026-0001"` as part of the POST /appointments response
-- shape both frontends build against, so it is added here rather than left
-- out. The numeric part comes from a dedicated sequence (not year-scoped) so
-- two concurrent bookings for different slots can never receive the same
-- reference — `nextval()` is safe under concurrent access without any extra
-- locking, unlike a `COUNT(*) + 1` read-then-write.
CREATE SEQUENCE "appointment_reference_seq" START WITH 1;

-- The `appointments` table is empty at this point in every environment this
-- migration has run against (M1 seeded no appointments), so the column can be
-- added as NOT NULL directly with no backfill step.
ALTER TABLE "appointments" ADD COLUMN "reference" VARCHAR(20) NOT NULL;

CREATE UNIQUE INDEX "appointments_reference_key" ON "appointments"("reference");
