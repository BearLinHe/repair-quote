-- Add apply_tax flag to Case
ALTER TABLE "Case"
ADD COLUMN "apply_tax" BOOLEAN NOT NULL DEFAULT true;

