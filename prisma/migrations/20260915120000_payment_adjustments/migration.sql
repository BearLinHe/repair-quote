ALTER TABLE "CustomerPayment"
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "voided_at" TIMESTAMP(3),
    ADD COLUMN "void_reason" TEXT,
    ADD COLUMN "voided_by_name" TEXT;
