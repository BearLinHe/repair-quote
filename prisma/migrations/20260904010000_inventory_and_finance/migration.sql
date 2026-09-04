CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELED');
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT', 'CASE_RESERVE', 'CASE_RELEASE', 'CASE_CONSUMPTION', 'COUNT_ADJUSTMENT', 'MANUAL_ADJUSTMENT');
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'VOID');

ALTER TABLE "CasePart"
  ADD COLUMN "inventory_item_id" TEXT,
  ADD COLUMN "unit_cost_snapshot_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cost_total_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reservation_active" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "unit" TEXT NOT NULL DEFAULT '个',
  "on_hand_qty" INTEGER NOT NULL DEFAULT 0,
  "reserved_qty" INTEGER NOT NULL DEFAULT 0,
  "avg_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "default_sale_price_cents" INTEGER NOT NULL DEFAULT 0,
  "reorder_level" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "purchase_number" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "purchase_date" TIMESTAMP(3) NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
  "additional_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cents" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "received_at" TIMESTAMP(3),
  "received_by" TEXT,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "purchase_order_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "name_snapshot" TEXT NOT NULL,
  "qty" INTEGER NOT NULL,
  "unit_cost_cents" INTEGER NOT NULL,
  "line_total_cents" INTEGER NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clerk_user_id" TEXT NOT NULL,
  "inventory_item_id" TEXT NOT NULL,
  "type" "StockMovementType" NOT NULL,
  "qty_change" INTEGER NOT NULL DEFAULT 0,
  "reserved_change" INTEGER NOT NULL DEFAULT 0,
  "unit_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "total_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "reference_type" TEXT,
  "reference_id" TEXT,
  "note" TEXT,
  CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceRecord" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "clerk_user_id" TEXT NOT NULL,
  "case_id" TEXT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "parts_revenue_cents" INTEGER NOT NULL,
  "labor_revenue_cents" INTEGER NOT NULL,
  "cleaning_fee_cents" INTEGER NOT NULL,
  "tax_cents" INTEGER NOT NULL,
  "grand_total_cents" INTEGER NOT NULL,
  "parts_cost_cents" INTEGER NOT NULL DEFAULT 0,
  "payment_status" "InvoicePaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "snapshot" JSONB NOT NULL,
  CONSTRAINT "InvoiceRecord_pkey" PRIMARY KEY ("id")
);

-- Preserve completed historical repair orders as immutable invoice records.
-- Historical parts have no inventory cost source, so their cost starts at zero.
INSERT INTO "InvoiceRecord" (
  "id", "created_at", "updated_at", "clerk_user_id", "case_id", "invoice_number",
  "issued_at", "parts_revenue_cents", "labor_revenue_cents", "cleaning_fee_cents",
  "tax_cents", "grand_total_cents", "parts_cost_cents", "payment_status", "snapshot"
)
SELECT
  md5(random()::text || clock_timestamp()::text || c."id"),
  c."updated_at", c."updated_at", c."clerk_user_id", c."id", c."invoice_number",
  c."updated_at", c."parts_subtotal_cents", c."labor_subtotal_cents", c."cleaning_fee_cents",
  c."tax_cents", c."grand_total_cents", 0, 'UNPAID'::"InvoicePaymentStatus",
  jsonb_build_object(
    'legacy', true,
    'invoice_number', c."invoice_number",
    'plate', c."plate",
    'vin', c."vin",
    'unit_number', c."unit_number",
    'customer_name', c."customer_name",
    'totals', jsonb_build_object(
      'parts_subtotal_cents', c."parts_subtotal_cents",
      'labor_subtotal_cents', c."labor_subtotal_cents",
      'cleaning_fee_cents', c."cleaning_fee_cents",
      'tax_cents', c."tax_cents",
      'grand_total_cents', c."grand_total_cents",
      'parts_cost_cents', 0
    )
  )
FROM "Case" c
WHERE c."status" = 'COMPLETED';

CREATE UNIQUE INDEX "InventoryItem_clerk_user_id_sku_key" ON "InventoryItem"("clerk_user_id", "sku");
CREATE INDEX "InventoryItem_clerk_user_id_name_idx" ON "InventoryItem"("clerk_user_id", "name");
CREATE UNIQUE INDEX "PurchaseOrder_purchase_number_key" ON "PurchaseOrder"("purchase_number");
CREATE INDEX "PurchaseOrder_clerk_user_id_purchase_date_idx" ON "PurchaseOrder"("clerk_user_id", "purchase_date");
CREATE INDEX "PurchaseOrderLine_purchase_order_id_idx" ON "PurchaseOrderLine"("purchase_order_id");
CREATE INDEX "PurchaseOrderLine_inventory_item_id_idx" ON "PurchaseOrderLine"("inventory_item_id");
CREATE INDEX "StockMovement_inventory_item_id_created_at_idx" ON "StockMovement"("inventory_item_id", "created_at");
CREATE INDEX "StockMovement_clerk_user_id_created_at_idx" ON "StockMovement"("clerk_user_id", "created_at");
CREATE UNIQUE INDEX "InvoiceRecord_case_id_key" ON "InvoiceRecord"("case_id");
CREATE UNIQUE INDEX "InvoiceRecord_invoice_number_key" ON "InvoiceRecord"("invoice_number");
CREATE INDEX "InvoiceRecord_clerk_user_id_issued_at_idx" ON "InvoiceRecord"("clerk_user_id", "issued_at");
CREATE INDEX "CasePart_inventory_item_id_idx" ON "CasePart"("inventory_item_id");

ALTER TABLE "CasePart" ADD CONSTRAINT "CasePart_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceRecord" ADD CONSTRAINT "InvoiceRecord_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
