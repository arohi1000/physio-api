-- Gives receipts a human-quotable number instead of exposing a UUID.
--
-- The generated PDF printed "Receipt No.: 8bee6cf1-5e69-4816-b2a2-e8fd4661240d",
-- which is unusable on a document a patient takes away and may read back over
-- the phone. Mirrors the appointment-reference pattern: a Postgres sequence,
-- whose increments are atomic under concurrency independent of transaction
-- outcome, unlike anything derived from a row count.
CREATE SEQUENCE "receipt_number_seq" START WITH 1;

ALTER TABLE "receipts" ADD COLUMN "number" VARCHAR(32);

-- Existing rows are development fixtures; numbering them by issue order keeps
-- the column honest rather than leaving it null.
UPDATE "receipts"
SET "number" = 'RCP-' || to_char("issued_at", 'YYYY') || '-'
             || lpad(nextval('receipt_number_seq')::text, 4, '0');

ALTER TABLE "receipts" ALTER COLUMN "number" SET NOT NULL;

CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");
