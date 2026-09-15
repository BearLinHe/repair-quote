import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { changePayment } from "../src/lib/payment-adjustment";
import { allocateExistingPayment, invoicePaidCents, ReconciliationError } from "../src/lib/payment-reconciliation";

// Opt-in integration check: random fixtures only, always rolled back.
test("adjustments and voids preserve other receipts, synchronize invoice status, version writes and retain audit history", { skip: process.env.RECONCILIATION_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const ownerId = `test-adjustment-${randomUUID()}`;
  const actorId = `test-actor-${randomUUID()}`;
  const rollback = new Error("ROLLBACK_PAYMENT_ADJUSTMENT_TEST");
  const scope = { ownerId, isAdmin: false };
  const actor = { userId: actorId, name: "Adjustment Test", email: "fixture@example.invalid" };
  const errorCode = (code: string) => (error: unknown) => error instanceof ReconciliationError && error.code === code;
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const invoiceIds: string[] = [];
      for (const amount of [58476, 149845]) {
        const repairCase = await tx.case.create({ data: { invoice_number: randomUUID(), clerk_user_id: ownerId, bill_to_company: "Adjustment Fixture", status: "COMPLETED" } });
        const invoice = await tx.invoiceRecord.create({ data: { id: randomBytes(16).toString("hex"), case_id: repairCase.id, invoice_number: repairCase.invoice_number, clerk_user_id: ownerId,
          parts_revenue_cents: amount, labor_revenue_cents: 0, cleaning_fee_cents: 0, tax_cents: 0, grand_total_cents: amount, snapshot: {} } });
        invoiceIds.push(invoice.id);
      }
      const [invoiceA, invoiceB] = invoiceIds;
      const createPayment = (amount: number) => tx.customerPayment.create({ data: { clerk_user_id: ownerId, bill_to_company: "Adjustment Fixture", received_at: new Date(), amount_cents: amount, payment_method: "TEST", created_by_user_id: actorId, created_by_name: actor.name } });
      const original = await createPayment(48000);
      const receipt = await createPayment(13600);
      await allocateExistingPayment(tx, { paymentId: original.id, scope, actor, expectedRevision: 0, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoiceA, amount_cents: 48000 }] });
      await allocateExistingPayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 0, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoiceA, amount_cents: 10476 }, { invoice_id: invoiceB, amount_cents: 3124 }] });
      const input = { paymentId: receipt.id, scope, actor, expectedRevision: 1, reason: "调整分配", action: "adjust" as const, allocations: [{ invoice_id: invoiceB, amount_cents: 1000 }] };
      await assert.rejects(changePayment(tx, { ...input, scope: { ownerId: "wrong-owner", isAdmin: false } }), errorCode("PAYMENT_NOT_FOUND"));
      await assert.rejects(changePayment(tx, { ...input, allocations: [{ invoice_id: invoiceA, amount_cents: 0 }, { invoice_id: invoiceB, amount_cents: 13601 }] }), errorCode("ALLOCATION_EXCEEDS_PAYMENT"));
      assert.equal((await tx.customerPayment.findUniqueOrThrow({ where: { id: receipt.id } })).revision, 1);
      assert.equal((await tx.paymentAllocation.findUniqueOrThrow({ where: { payment_id_invoice_id: { payment_id: receipt.id, invoice_id: invoiceA } } })).amount_cents, 10476);

      const partial = await changePayment(tx, input);
      assert.equal(partial.remaining_cents, 2124);
      assert.equal(partial.allocated_cents, 11476);
      await assert.rejects(changePayment(tx, input), errorCode("STALE_PAYMENT"));
      const moved = await changePayment(tx, { ...input, expectedRevision: 2, reason: "转到另一张账单", allocations: [{ invoice_id: invoiceA, amount_cents: 0 }, { invoice_id: invoiceB, amount_cents: 11476 }] });
      assert.equal(moved.allocated_cents, 11476);
      assert.equal((await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceA } })).payment_status, "PARTIAL");
      // The allocated sum stayed the same; a stale client must still be rejected by revision.
      await assert.rejects(allocateExistingPayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 2, expectedAllocatedCents: 11476, allocations: [{ invoice_id: invoiceB, amount_cents: 2124 }] }), errorCode("STALE_PAYMENT"));
      await allocateExistingPayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 3, expectedAllocatedCents: 11476, allocations: [{ invoice_id: invoiceB, amount_cents: 2124 }] });

      const voided = await changePayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 4, action: "void", reason: "支票退票" });
      assert.equal(voided.remaining_cents, 0);
      const savedReceipt = await tx.customerPayment.findUniqueOrThrow({ where: { id: receipt.id }, include: { allocations: true } });
      assert.equal(savedReceipt.amount_cents, 13600);
      assert.equal(savedReceipt.revision, 5);
      assert.ok(savedReceipt.voided_at);
      assert.equal(savedReceipt.void_reason, "支票退票");
      assert.equal(savedReceipt.voided_by_name, actor.name);
      assert.ok(savedReceipt.allocations.every((item) => item.amount_cents === 0));
      const invoiceAfterVoid = await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceB }, include: { allocations: true } });
      assert.equal(invoiceAfterVoid.payment_status, "UNPAID");
      assert.equal(invoicePaidCents(invoiceAfterVoid), 0);
      assert.equal((await tx.paymentAllocation.findUniqueOrThrow({ where: { payment_id_invoice_id: { payment_id: original.id, invoice_id: invoiceA } } })).amount_cents, 48000);
      assert.equal((await tx.customerPayment.findUniqueOrThrow({ where: { id: original.id } })).voided_at, null);
      await assert.rejects(changePayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 5, action: "void", reason: "重复作废" }), errorCode("PAYMENT_VOIDED"));
      await assert.rejects(allocateExistingPayment(tx, { paymentId: receipt.id, scope, actor, expectedRevision: 5, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoiceB, amount_cents: 1 }] }), errorCode("PAYMENT_VOIDED"));

      const audits = await tx.auditLog.findMany({ where: { entity_id: receipt.id, action: { in: ["PAYMENT_ALLOCATION_ADJUSTED", "PAYMENT_VOIDED"] } }, orderBy: { created_at: "asc" } });
      assert.equal(audits.length, 3);
      assert.ok(audits.every((event) => event.actor_user_id === actorId && event.actor_name === actor.name));
      const last = audits.find((event) => event.action === "PAYMENT_VOIDED")!;
      const details = last.details as { reason: string; before_allocated_cents: number; after_allocated_cents: number; changes: { before_cents: number; after_cents: number; invoice_number: string }[] };
      assert.equal(details.reason, "支票退票");
      assert.equal(details.before_allocated_cents, 13600);
      assert.equal(details.after_allocated_cents, 0);
      assert.equal(details.changes[0].before_cents, 13600);
      assert.equal(details.changes[0].after_cents, 0);
      assert.ok(details.changes[0].invoice_number);

      // A fully withdrawn (not voided) receipt remains available and reuses its ledger row.
      const withdrawn = await changePayment(tx, { paymentId: original.id, scope, actor, expectedRevision: 1, action: "adjust", reason: "全部撤回", allocations: [{ invoice_id: invoiceA, amount_cents: 0 }] });
      assert.equal(withdrawn.remaining_cents, 48000);
      assert.equal((await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoiceA } })).payment_status, "UNPAID");
      await allocateExistingPayment(tx, { paymentId: original.id, scope, actor, expectedRevision: 2, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoiceA, amount_cents: 100 }] });
      assert.equal(await tx.paymentAllocation.count({ where: { payment_id: original.id, invoice_id: invoiceA } }), 1);

      const unused = await createPayment(14500);
      await changePayment(tx, { paymentId: unused.id, scope, actor, expectedRevision: 0, action: "void", reason: "重复登记未分配收款" });
      assert.equal(await tx.customerPayment.count({ where: { clerk_user_id: ownerId } }), 3);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 }), (error) => error === rollback);
    assert.equal(await db.customerPayment.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.invoiceRecord.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.case.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.auditLog.count({ where: { actor_user_id: actorId } }), 0);
  } finally { await db.$disconnect(); }
});
