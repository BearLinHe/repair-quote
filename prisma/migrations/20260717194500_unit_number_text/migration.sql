-- Preserve existing numeric unit numbers while allowing letters and symbols.
ALTER TABLE "Case"
ALTER COLUMN "unit_number" TYPE TEXT
USING "unit_number"::TEXT;
