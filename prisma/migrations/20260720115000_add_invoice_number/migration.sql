ALTER TABLE "Case" ADD COLUMN "invoice_number" TEXT;

DO $$
DECLARE
  current_case RECORD;
  candidate TEXT;
BEGIN
  FOR current_case IN
    SELECT "id", "created_at" FROM "Case" WHERE "invoice_number" IS NULL
  LOOP
    LOOP
      candidate :=
        to_char(current_case."created_at" AT TIME ZONE 'America/Los_Angeles', 'YYYYMMDD') ||
        lpad(floor(random() * 100000000)::bigint::text, 8, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "Case" WHERE "invoice_number" = candidate
      );
    END LOOP;

    UPDATE "Case"
    SET "invoice_number" = candidate
    WHERE "id" = current_case."id";
  END LOOP;
END $$;

ALTER TABLE "Case" ALTER COLUMN "invoice_number" SET NOT NULL;
CREATE UNIQUE INDEX "Case_invoice_number_key" ON "Case"("invoice_number");
