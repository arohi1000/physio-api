-- CreateTable
-- Additive only: new table for M5-CONTRACT.md §2, no existing table touched.
CREATE TABLE "site_content" (
    "key" VARCHAR(64) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("key")
);
