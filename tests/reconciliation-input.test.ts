import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentSchema, continuePaymentSchema, reconciliationInputError } from "../src/lib/reconciliation-input";
import { invoicePaidCents, planPaymentAllocation, ReconciliationError } from "../src/lib/payment-reconciliation";

const legacyId = "0123456789abcdef0123456789abcdef";
const uuidId = "cc7e8c88-61d9-4c85-bd09-a4d7da40a884";
const receipt = { bill_to_company: "Test Company", received_at: "2026-09-15", amount_cents: 48000, payment_method: "check" };
const allocation = (id = legacyId, amount = 48000) => ({ invoice_id: id, amount_cents: amount });

test("both reconciliation entry points accept legacy hex and UUID invoice IDs unchanged", () => {
  for (const id of [legacyId, uuidId]) {
    const allocations = [allocation(id)];
    assert.deepEqual(continuePaymentSchema.parse({ expected_allocated_cents: 0, allocations }).allocations, allocations);
    assert.deepEqual(createPaymentSchema.parse({ ...receipt, allocations }).allocations, allocations);
  }
  assert.equal(createPaymentSchema.safeParse({ ...receipt, allocations: [allocation(legacyId, 24000), allocation(uuidId, 24000)] }).success, true);
});

test("legacy invoice can receive $480 against $584.76 without weakening balance or ownership checks", () => {
  const parsed = continuePaymentSchema.parse({ expected_allocated_cents: 0, allocations: [allocation()] });
  const invoice = {
    id: legacyId, invoice_number: "TEST-INVOICE", clerk_user_id: "test-owner",
    grand_total_cents: 58476, payment_status: "UNPAID", allocations: [],
    case: { bill_to_company: "Test Company" },
  };
  const input = { payment: { ...receipt, allocations: [] }, expectedAllocatedCents: parsed.expected_allocated_cents,
    allocations: parsed.allocations, invoices: [invoice], scope: { ownerId: "test-owner", isAdmin: false } };
  const result = planPaymentAllocation(input);
  assert.equal(result.remainingCents, 0);
  assert.equal(result.updates[0].payment_status, "PARTIAL");
  assert.equal(invoice.grand_total_cents - invoicePaidCents({ ...invoice, allocations: [{ amount_cents: result.total }] }), 10476);
  for (const invalid of [
    { ...input, scope: { ownerId: "other-owner", isAdmin: false } },
    { ...input, invoices: [] },
    { ...input, invoices: [{ ...invoice, case: { bill_to_company: "Other Company" } }] },
    { ...input, invoices: [{ ...invoice, grand_total_cents: 47000 }] },
    { ...input, allocations: [allocation(legacyId, 48001)] },
  ]) assert.throws(() => planPaymentAllocation(invalid), ReconciliationError);
});

test("bad invoice identifiers are rejected with an ID error, not an amount error", () => {
  for (const id of ["", "123", "../../invoice", "x".repeat(32), legacyId.slice(1), `${legacyId}0`, ` ${legacyId}`, `${uuidId}extra`]) {
    for (const result of [
      continuePaymentSchema.safeParse({ expected_allocated_cents: 0, allocations: [allocation(id)] }),
      createPaymentSchema.safeParse({ ...receipt, allocations: [allocation(id)] }),
    ]) {
      assert.equal(result.success, false);
      if (!result.success) assert.match(reconciliationInputError(result.error, "fallback"), /Invoice 标识格式不正确/);
    }
  }
});

test("legacy compatibility still rejects invalid money and missing/stale-balance fields", () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, 2147483648, "48000", null]) {
    const allocations = [{ invoice_id: legacyId, amount_cents: amount }];
    for (const result of [
      continuePaymentSchema.safeParse({ expected_allocated_cents: 0, allocations }),
      createPaymentSchema.safeParse({ ...receipt, allocations }),
    ]) {
      assert.equal(result.success, false);
      if (!result.success) assert.match(reconciliationInputError(result.error, "fallback"), /销账金额/);
    }
  }
  assert.equal(continuePaymentSchema.safeParse({ expected_allocated_cents: 0, allocations: [] }).success, false);
  assert.equal(createPaymentSchema.safeParse({ ...receipt, allocations: [] }).success, true);
  const invalidBalance = continuePaymentSchema.safeParse({ allocations: [allocation()] });
  assert.equal(invalidBalance.success, false);
  if (!invalidBalance.success) assert.match(reconciliationInputError(invalidBalance.error, "fallback"), /收款余额信息/);
  const tooMany = Array.from({ length: 501 }, () => allocation(legacyId, 1));
  assert.equal(continuePaymentSchema.safeParse({ expected_allocated_cents: 0, allocations: tooMany }).success, false);
  assert.equal(createPaymentSchema.safeParse({ ...receipt, allocations: tooMany }).success, false);
});
