ALTER TABLE "PurchaseOrder" ADD COLUMN "supplier_invoice_number" TEXT,
  ADD COLUMN "supplier_key" TEXT, ADD COLUMN "supplier_invoice_key" TEXT;
CREATE UNIQUE INDEX "PurchaseOrder_clerk_user_id_supplier_key_supplier_invoice_key_key"
  ON "PurchaseOrder"("clerk_user_id", "supplier_key", "supplier_invoice_key");

CREATE TABLE "PurchaseImport" (
  "id" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "clerk_user_id" TEXT NOT NULL,
  "file_hash" TEXT NOT NULL, "file_name" TEXT NOT NULL, "image_data_url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING', "model" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 1, "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "extracted" JSONB, "reviewed" JSONB, "created_by" TEXT NOT NULL,
  "purchase_order_id" TEXT,
  CONSTRAINT "PurchaseImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseImport_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id")
    REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PurchaseImport_purchase_order_id_key" ON "PurchaseImport"("purchase_order_id");
CREATE UNIQUE INDEX "PurchaseImport_clerk_user_id_file_hash_key" ON "PurchaseImport"("clerk_user_id", "file_hash");
CREATE INDEX "PurchaseImport_clerk_user_id_created_at_idx" ON "PurchaseImport"("clerk_user_id", "created_at");

CREATE TABLE "SupplierPartMapping" (
  "id" TEXT NOT NULL, "clerk_user_id" TEXT NOT NULL, "supplier_key" TEXT NOT NULL,
  "item_number_key" TEXT NOT NULL, "inventory_item_id" TEXT NOT NULL,
  CONSTRAINT "SupplierPartMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierPartMapping_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id")
    REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierPartMapping_clerk_user_id_supplier_key_item_number_ke_key"
  ON "SupplierPartMapping"("clerk_user_id", "supplier_key", "item_number_key");
