-- Add apply_cleaning flag to Case (optional cleaning fee like apply_tax)
ALTER TABLE "Case" ADD COLUMN "apply_cleaning" BOOLEAN NOT NULL DEFAULT true;
