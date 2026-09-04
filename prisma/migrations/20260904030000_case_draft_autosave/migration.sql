ALTER TABLE "Case"
  ADD COLUMN "draft_data" JSONB,
  ADD COLUMN "draft_updated_at" TIMESTAMP(3);
