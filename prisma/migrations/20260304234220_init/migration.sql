-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'CANCELED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "plate" TEXT,
    "vin" TEXT,
    "unit_number" INTEGER,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "check_in_at" TIMESTAMP(3),
    "status" "CaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "parts_subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "labor_subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "cleaning_fee_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "grand_total_cents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseRepairItem" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "case_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseRepairItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CasePart" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "case_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "CasePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseLabor" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "case_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "rate_cents" INTEGER NOT NULL,
    "line_total_cents" INTEGER NOT NULL,

    CONSTRAINT "CaseLabor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStatusLog" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_status" "CaseStatus",
    "to_status" "CaseStatus" NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "CaseStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cleaning_rate_bps" INTEGER NOT NULL DEFAULT 1000,
    "cleaning_cap_cents" INTEGER NOT NULL DEFAULT 20000,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 1075,
    "company_name" TEXT NOT NULL DEFAULT 'YaoYuan Inc.',

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CaseRepairItem" ADD CONSTRAINT "CaseRepairItem_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasePart" ADD CONSTRAINT "CasePart_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLabor" ADD CONSTRAINT "CaseLabor_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusLog" ADD CONSTRAINT "CaseStatusLog_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
