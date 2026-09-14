import assert from "node:assert/strict";
import test from "node:test";
import { invoicePaidCents, planPaymentAllocation, ReconciliationError } from "../src/lib/payment-reconciliation";

const scope = { ownerId: "owner-a", isAdmin: false };
function invoice(id: string, amount: number, paid = 0) {
  return {
    id, invoice_number: id, clerk_user_id: "owner-a", grand_total_cents: amount,
    payment_status: paid ? "PARTIAL" : "UNPAID",
    case: { bill_to_company: "YG Trucking LLC" },
    allocations: paid ? [{ amount_cents: paid }] : [],
  };
}
function receipt(paid = 0) {
  return { amount_cents: 48000, bill_to_company: "YG Trucking LLC", allocations: paid ? [{ amount_cents: paid }] : [] };
}
function rejects(code: string) {
  return (error: unknown) => error instanceof ReconciliationError && error.code === code;
}

test("allocates existing $480 across invoices, including $210 against a $230 invoice", () => {
  const result = planPaymentAllocation({
    scope, payment: receipt(), expectedAllocatedCents: 0,
    invoices: [invoice("A", 27000), invoice("B", 23000)],
    allocations: [{ invoice_id: "A", amount_cents: 27000 }, { invoice_id: "B", amount_cents: 21000 }],
  });
  assert.equal(result.remainingCents, 0);
  assert.equal(result.allocatedCents, 48000);
  assert.deepEqual(result.updates.map((item) => item.payment_status), ["PAID", "PARTIAL"]);
});

test("continues a previously allocated receipt without resetting paid amounts", () => {
  const result = planPaymentAllocation({
    scope, payment: receipt(27000), expectedAllocatedCents: 27000,
    invoices: [invoice("A", 50000, 27000)], allocations: [{ invoice_id: "A", amount_cents: 21000 }],
  });
  assert.equal(result.allocatedCents, 48000);
  assert.equal(result.remainingCents, 0);
  assert.equal(result.updates[0].payment_status, "PARTIAL");
});

test("keeps unallocated credit available for a later allocation", () => {
  const result = planPaymentAllocation({
    scope, payment: receipt(), expectedAllocatedCents: 0,
    invoices: [invoice("A", 23000)], allocations: [{ invoice_id: "A", amount_cents: 21000 }],
  });
  assert.equal(result.remainingCents, 27000);
});

test("rejects stale submissions, receipt over-allocation, and invoice overpayment", () => {
  const input = { scope, payment: receipt(27000), expectedAllocatedCents: 27000, invoices: [invoice("A", 23000)], allocations: [{ invoice_id: "A", amount_cents: 21000 }] };
  assert.throws(() => planPaymentAllocation({ ...input, expectedAllocatedCents: 0 }), rejects("STALE_PAYMENT"));
  assert.throws(() => planPaymentAllocation({ ...input, allocations: [{ invoice_id: "A", amount_cents: 22000 }] }), rejects("ALLOCATION_EXCEEDS_PAYMENT"));
  assert.throws(() => planPaymentAllocation({ ...input, invoices: [invoice("A", 23000, 3000)] }), rejects("ALLOCATION_EXCEEDS_BALANCE"));
});

test("rejects wrong company, inaccessible invoices, void invoices, and invalid amounts", () => {
  const a = invoice("A", 50000);
  const input = { scope, payment: receipt(), expectedAllocatedCents: 0, invoices: [a], allocations: [{ invoice_id: "A", amount_cents: 21000 }] };
  assert.throws(() => planPaymentAllocation({ ...input, invoices: [{ ...a, case: { bill_to_company: "Other company" } }] }), rejects("BILL_TO_MISMATCH"));
  assert.throws(() => planPaymentAllocation({ ...input, invoices: [{ ...a, clerk_user_id: "other-owner" }] }), rejects("INVOICE_NOT_FOUND"));
  assert.throws(() => planPaymentAllocation({ ...input, invoices: [{ ...a, payment_status: "VOID" }] }), rejects("INVOICE_VOID"));
  for (const amount_cents of [-1, 0, 10.5, NaN]) {
    assert.throws(() => planPaymentAllocation({ ...input, allocations: [{ invoice_id: "A", amount_cents }] }), rejects("INVALID_AMOUNT"));
  }
  assert.throws(() => planPaymentAllocation({ ...input, allocations: [] }), rejects("INVALID_AMOUNT"));
  assert.throws(() => planPaymentAllocation({ ...input, allocations: [...input.allocations, ...input.allocations] }), rejects("DUPLICATE_INVOICE"));
});

test("does not collect again on invoices marked paid before the ledger existed", () => {
  const historical = { ...invoice("A", 23000), payment_status: "PAID" };
  assert.equal(invoicePaidCents(historical), 23000);
  assert.throws(() => planPaymentAllocation({ scope, payment: receipt(), expectedAllocatedCents: 0, invoices: [historical], allocations: [{ invoice_id: "A", amount_cents: 1 }] }), rejects("ALLOCATION_EXCEEDS_BALANCE"));
});
