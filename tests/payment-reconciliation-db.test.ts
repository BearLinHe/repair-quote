import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { allocateExistingPayment, ReconciliationError } from "../src/lib/payment-reconciliation";
import { continuePaymentSchema } from "../src/lib/reconciliation-input";

// Explicit opt-in; all fixtures and ledger writes are rolled back, even on success.
test("existing receipt allocation persists totals/status/audit atomically without creating another receipt", { skip: process.env.RECONCILIATION_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const rollback = new Error("ROLLBACK_RECONCILIATION_TEST");
  const ownerId = `test-reconciliation-${randomUUID()}`;
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const repairCase = await tx.case.create({ data: { invoice_number: randomUUID(), clerk_user_id: ownerId, bill_to_company: "Reconciliation Test", status: "COMPLETED" } });
      const invoice = await tx.invoiceRecord.create({ data: {
        case_id: repairCase.id, clerk_user_id: ownerId, invoice_number: repairCase.invoice_number,
        parts_revenue_cents: 50000, labor_revenue_cents: 0, cleaning_fee_cents: 0,
        tax_cents: 0, grand_total_cents: 50000, snapshot: {},
      } });
      const payment = await tx.customerPayment.create({ data: {
        clerk_user_id: ownerId, bill_to_company: "Reconciliation Test", received_at: new Date(),
        amount_cents: 48000, payment_method: "TEST", created_by_user_id: ownerId, created_by_name: "Test",
      } });
      const input = { paymentId: payment.id, scope: { ownerId, isAdmin: false }, actor: { userId: ownerId, name: "Test", email: null } };
      await assert.rejects(allocateExistingPayment(tx, { ...input, scope: { ownerId: "wrong-owner", isAdmin: false }, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoice.id, amount_cents: 27000 }] }), (error) => error instanceof ReconciliationError && error.code === "PAYMENT_NOT_FOUND");
      await allocateExistingPayment(tx, { ...input, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoice.id, amount_cents: 27000 }] });
      const result = await allocateExistingPayment(tx, { ...input, expectedAllocatedCents: 27000, allocations: [{ invoice_id: invoice.id, amount_cents: 21000 }] });
      assert.equal(result.remaining_cents, 0);
      assert.equal(await tx.customerPayment.count({ where: { clerk_user_id: ownerId } }), 1);
      assert.equal(await tx.paymentAllocation.count({ where: { payment_id: payment.id } }), 1);
      assert.equal((await tx.paymentAllocation.findFirstOrThrow({ where: { payment_id: payment.id } })).amount_cents, 48000);
      assert.equal((await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoice.id } })).payment_status, "PARTIAL");
      assert.equal(await tx.auditLog.count({ where: { entity_id: payment.id, action: "PAYMENT_ALLOCATION_ADDED" } }), 2);
      await assert.rejects(allocateExistingPayment(tx, { ...input, expectedAllocatedCents: 27000, allocations: [{ invoice_id: invoice.id, amount_cents: 21000 }] }), (error) => error instanceof ReconciliationError && error.code === "STALE_PAYMENT");
      const secondPayment = await tx.customerPayment.create({ data: { clerk_user_id: ownerId, bill_to_company: "Reconciliation Test", received_at: new Date(), amount_cents: 2000, payment_method: "TEST", created_by_user_id: ownerId, created_by_name: "Test" } });
      await allocateExistingPayment(tx, { ...input, paymentId: secondPayment.id, expectedAllocatedCents: 0, allocations: [{ invoice_id: invoice.id, amount_cents: 2000 }] });
      assert.equal((await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoice.id } })).payment_status, "PAID");
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }), (error) => error === rollback);
    assert.equal(await db.customerPayment.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.case.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.auditLog.count({ where: { actor_user_id: ownerId } }), 0);
  } finally {
    await db.$disconnect();
  }
});

test("legacy 32-character invoice ID passes request validation and persists partial settlement atomically", { skip: process.env.RECONCILIATION_DB_TEST !== "1" }, async () => {
  const db = new PrismaClient();
  const rollback = new Error("ROLLBACK_LEGACY_INVOICE_TEST");
  const ownerId = `test-reconciliation-${randomUUID()}`;
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      const repairCase = await tx.case.create({ data: { invoice_number: randomUUID(), clerk_user_id: ownerId, bill_to_company: "Legacy ID Test", status: "COMPLETED" } });
      const invoice = await tx.invoiceRecord.create({ data: {
        id: randomBytes(16).toString("hex"), case_id: repairCase.id, clerk_user_id: ownerId,
        invoice_number: repairCase.invoice_number, parts_revenue_cents: 58476,
        labor_revenue_cents: 0, cleaning_fee_cents: 0, tax_cents: 0, grand_total_cents: 58476, snapshot: {},
      } });
      const payment = await tx.customerPayment.create({ data: {
        clerk_user_id: ownerId, bill_to_company: "Legacy ID Test", received_at: new Date(),
        amount_cents: 48000, payment_method: "TEST", created_by_user_id: ownerId, created_by_name: "Test",
      } });
      const parsed = continuePaymentSchema.parse({ expected_revision: 0, expected_allocated_cents: 0, allocations: [{ invoice_id: invoice.id, amount_cents: 48000 }] });
      const result = await allocateExistingPayment(tx, {
        paymentId: payment.id, expectedRevision: parsed.expected_revision, expectedAllocatedCents: parsed.expected_allocated_cents, allocations: parsed.allocations,
        scope: { ownerId, isAdmin: false }, actor: { userId: ownerId, name: "Test", email: null },
      });
      const saved = await tx.invoiceRecord.findUniqueOrThrow({ where: { id: invoice.id }, include: { allocations: true } });
      assert.equal(saved.payment_status, "PARTIAL");
      assert.equal(saved.grand_total_cents - saved.allocations.reduce((sum, item) => sum + item.amount_cents, 0), 10476);
      assert.equal(result.remaining_cents, 0);
      assert.equal(await tx.customerPayment.count({ where: { clerk_user_id: ownerId } }), 1);
      assert.equal(await tx.auditLog.count({ where: { actor_user_id: ownerId, action: "PAYMENT_ALLOCATION_ADDED" } }), 1);
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }), (error) => error === rollback);
    assert.equal(await db.case.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.invoiceRecord.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.customerPayment.count({ where: { clerk_user_id: ownerId } }), 0);
    assert.equal(await db.auditLog.count({ where: { actor_user_id: ownerId } }), 0);
  } finally {
    await db.$disconnect();
  }
});
