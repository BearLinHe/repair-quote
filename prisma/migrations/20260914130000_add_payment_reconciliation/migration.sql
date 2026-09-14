-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "bill_to_company" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL,
    "reference_number" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "created_by_email" TEXT,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPayment_clerk_user_id_received_at_idx" ON "CustomerPayment"("clerk_user_id", "received_at");

-- CreateIndex
CREATE INDEX "CustomerPayment_bill_to_company_received_at_idx" ON "CustomerPayment"("bill_to_company", "received_at");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoice_id_created_at_idx" ON "PaymentAllocation"("invoice_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_payment_id_invoice_id_key" ON "PaymentAllocation"("payment_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "CustomerPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "InvoiceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
