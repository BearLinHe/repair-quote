ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'CASE_RETURN';

ALTER TABLE "InventoryItem" ADD COLUMN "image_data_url" TEXT;
