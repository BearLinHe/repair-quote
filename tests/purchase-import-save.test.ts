import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { saveReviewedPurchase } from "../src/lib/purchase-import-save";

test("a concurrent catalog rename aborts enrichment before creating a purchase", async () => {
  const item = { id: "de537577-51af-4b4d-bd72-8d0044130249", name: "Sensor", sku: "A1" };
  const tx = {
    $queryRaw: async () => [],
    purchaseImport: { findUnique: async () => ({ clerk_user_id: "owner", purchase_order_id: null, status: "READY" }) },
    purchaseOrder: {
      findUnique: async () => null,
      create: async () => assert.fail("No purchase may be saved on a concurrent-name conflict"),
    },
    inventoryItem: {
      findFirst: async () => item,
      updateMany: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { id: item.id, clerk_user_id: "owner", is_active: true, name: "Sensor" },
          data: { name: "Sensor / 传感器" },
        });
        return { count: 0 };
      },
    },
    auditLog: { create: async () => assert.fail("No success audit may be written on conflict") },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(saveReviewedPurchase(tx, "source", "owner", { userId: "reviewer", name: "Reviewer", email: null }, {
    supplier: "Test", invoice_number: "TEST-1", invoice_date: "2026-09-29", currency: "USD",
    subtotal: "10.00", tax: "0.00", shipping: "0.00", surcharge: "0.00", total: "10.00", notes: "", confirmed: true,
    lines: [{ item_number: "A1", description: "Sensor", description_zh: "传感器", qty: 1, unit_price: "10.00", line_amount: "10.00", kind: "PART", inventory_item_id: item.id, new_sku: "", unit: "个" }],
  }), /库存名称已变更/);
});
