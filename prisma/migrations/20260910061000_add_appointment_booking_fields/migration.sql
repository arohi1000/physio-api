-- Adds two fields to `appointments` that are not in the TRD §4.5 table but
-- are required booking-payload fields in M2-CONTRACT.md §2: `reasonForVisit`
-- and `paymentPreference`. Persisted rather than accepted-and-discarded so
-- neither is silently lost before the doctor or the M5 payment flow can use
-- it. The table is still empty (see the previous migration's note), so both
-- columns are added NOT NULL with no backfill.
CREATE TYPE "appointment_reason_for_visit" AS ENUM (
  'acute_injury',
  'persistent_pain',
  'post_surgical',
  'chronic_condition',
  'sports_performance',
  'general_assessment'
);

CREATE TYPE "payment_preference" AS ENUM ('online', 'clinic');

ALTER TABLE "appointments"
  ADD COLUMN "reason_for_visit" "appointment_reason_for_visit" NOT NULL,
  ADD COLUMN "payment_preference" "payment_preference" NOT NULL;
