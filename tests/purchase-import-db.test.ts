import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { saveReviewedPurchase } from "../src/lib/purchase-import-save";
import type { ReviewedInvoice } from "../src/lib/purchase-import";

test("AI purchase review is atomic, idempotent, account-scoped and never directly changes stock", { skip: process.env.PURCHASE_IMPORT_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const owner = `test-ai-purchase-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_AI_PURCHASE_TEST");
  const actor = { userId: owner, name: "Test reviewer", email: null };
  const review: ReviewedInvoice = {
    supplier: "Test Supplier", invoice_number: "test-invoice", invoice_date: "2026-09-24", currency: "USD", subtotal: "30.00", tax: "3.00", shipping: "2.00", surcharge: "0.00", total: "35.00", notes: "", confirmed: true,
    lines: [
      { item_number: "DDE A1", description: "Sensor", qty: 2, unit_price: "10.00", line_amount: "20.00", kind: "PART", inventory_item_id: null, new_sku: "DDE A1", unit: "个" },
      { item_number: "DDE A1-CORE", description: "Core", qty: 2, unit_price: "5.00", line_amount: "10.00", kind: "CORE", inventory_item_id: null, new_sku: "", unit: "个" },
    ],
  };
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const source = await tx.purchaseImport.create({ data: { clerk_user_id: owner, file_hash: "first-file", file_name: "test.jpg", image_data_url: "test-only", model: "test", created_by: owner, status: "READY", extracted: {} } });
      await assert.rejects(saveReviewedPurchase(tx, source.id, `${owner}-other`, actor, review), /不存在/);
      const foreignItem = await tx.inventoryItem.create({ data: { clerk_user_id: `${owner}-other`, sku: "DDE A1", name: "Foreign", unit: "个" } });
      await assert.rejects(saveReviewedPurchase(tx, source.id, owner, actor, { ...review, lines: [{ ...review.lines[0], inventory_item_id: foreignItem.id }, review.lines[1]] }), /不属于当前账号/);
      const order = await saveReviewedPurchase(tx, source.id, owner, actor, review);
      assert.equal(order.status, "DRAFT");
      assert.equal(order.subtotal_cents, 2000);
      assert.equal(order.additional_cost_cents, 1500);
      assert.equal(order.total_cents, 3500);
      const items = await tx.inventoryItem.findMany({ where: { clerk_user_id: owner } });
      assert.equal(items.length, 1); // no CORE stock item
      assert.equal(items[0].on_hand_qty, 0);
      assert.equal(items[0].avg_cost_cents, 0);
      assert.equal(await tx.stockMovement.count({ where: { clerk_user_id: owner } }), 0);
      const lines = await tx.purchaseOrderLine.findMany({ where: { purchase_order_id: order.id } });
      assert.equal(lines.length, 1);
      assert.equal(lines[0].qty, 2);
      assert.equal(lines[0].unit_cost_cents, 1000); // ancillary costs not capitalized
      assert.equal(await tx.supplierPartMapping.count({ where: { clerk_user_id: owner } }), 1);
      const saved = await tx.purchaseImport.findUniqueOrThrow({ where: { id: source.id } });
      assert.equal(saved.status, "SAVED");
      assert.deepEqual(saved.reviewed, review);
      assert.equal((await saveReviewedPurchase(tx, source.id, owner, actor, review)).id, order.id);
      assert.equal(await tx.purchaseOrder.count({ where: { clerk_user_id: owner } }), 1);
      const second = await tx.purchaseImport.create({ data: { clerk_user_id: owner, file_hash: "second-file", file_name: "test2.jpg", image_data_url: "test-only", model: "test", created_by: owner, status: "READY" } });
      await assert.rejects(saveReviewedPurchase(tx, second.id, owner, actor, { ...review, supplier: "test supplier", invoice_number: " TEST-INVOICE " }), /已经建单/);
      assert.equal(await tx.auditLog.count({ where: { actor_user_id: owner } }), 2);
      throw rollback;
    }, { timeout: 60000 }), (error) => error === rollback);
    assert.equal(await db.purchaseImport.count({ where: { clerk_user_id: owner } }), 0);
    assert.equal(await db.inventoryItem.count({ where: { clerk_user_id: { startsWith: owner } } }), 0);
  } finally { await db.$disconnect(); }
});
