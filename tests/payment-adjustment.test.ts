import assert from "node:assert/strict";
import test from "node:test";
import { planPaymentChange } from "../src/lib/payment-adjustment";
import { adjustmentPreview, adjustmentFeedback, filterAdjustmentInvoices, AdjustmentInvoice } from "../src/lib/payment-adjustment-view";
import { ReconciliationError } from "../src/lib/payment-reconciliation";
import { changePaymentSchema, continuePaymentSchema, reconciliationInputError } from "../src/lib/reconciliation-input";
import { receiptAllocationStatus } from "../src/lib/reconciliation-view";

const invoiceA = "0123456789abcdef0123456789abcdef";
const invoiceB = "cc7e8c88-61d9-4c85-bd09-a4d7da40a884";
const allocation = (invoice_id: string, amount_cents: number) => ({ invoice_id, amount_cents });
const fixture = () => ({
  action: "adjust" as "adjust" | "void", reason: "分配更正", expectedRevision: 2,
  scope: { ownerId: "owner", isAdmin: false },
  payment: { id: "payment", clerk_user_id: "owner", bill_to_company: "Company", amount_cents: 13600, revision: 2, voided_at: null as Date | null,
    allocations: [allocation(invoiceA, 10476), allocation(invoiceB, 3124)] },
  invoices: [
    { id: invoiceA, invoice_number: "INV-A", clerk_user_id: "owner", grand_total_cents: 58476, payment_status: "PAID", case: { bill_to_company: "Company" },
      allocations: [{ payment_id: "other-payment", amount_cents: 48000 }, { payment_id: "payment", amount_cents: 10476 }] },
    { id: invoiceB, invoice_number: "INV-B", clerk_user_id: "owner", grand_total_cents: 149845, payment_status: "PARTIAL", case: { bill_to_company: "Company" },
      allocations: [{ payment_id: "payment", amount_cents: 3124 }] },
  ],
  allocations: [allocation(invoiceB, 1000)],
});
const errorCode = (code: string) => (error: unknown) => error instanceof ReconciliationError && error.code === code;

test("partial reversal restores only this receipt's allocation and leaves omitted invoices unchanged", () => {
  const plan = planPaymentChange(fixture());
  assert.equal(plan.beforeTotal, 13600);
  assert.equal(plan.afterTotal, 11476);
  assert.equal(plan.remaining, 2124);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].invoice_id, invoiceB);
  assert.equal(plan.changes[0].invoice_paid_after_cents, 1000);
  assert.equal(plan.changes[0].payment_status, "PARTIAL");
});

test("reallocation between invoices can keep receipt total unchanged", () => {
  const plan = planPaymentChange({ ...fixture(), allocations: [allocation(invoiceA, 0), allocation(invoiceB, 13600)] });
  assert.equal(plan.afterTotal, 13600);
  assert.equal(plan.remaining, 0);
  assert.equal(plan.changes[0].invoice_paid_after_cents, 48000);
  assert.equal(plan.changes[0].payment_status, "PARTIAL");
  assert.equal(plan.changes[1].invoice_paid_after_cents, 13600);
});

test("full reversal releases receipt balance but preserves the other $480 payment", () => {
  const plan = planPaymentChange({ ...fixture(), allocations: [allocation(invoiceA, 0), allocation(invoiceB, 0)] });
  assert.equal(plan.afterTotal, 0);
  assert.equal(plan.remaining, 13600);
  assert.equal(plan.changes[0].invoice_paid_after_cents, 48000);
  assert.equal(plan.changes[0].invoice_outstanding_after_cents, 10476);
  assert.equal(plan.changes[1].payment_status, "UNPAID");
});

test("void reverses all current allocations, retains other payments, and creates no usable credit", () => {
  const plan = planPaymentChange({ ...fixture(), action: "void" });
  assert.equal(plan.afterTotal, 0);
  assert.equal(plan.remaining, 0);
  assert.deepEqual(plan.changes.map((item) => item.after_cents), [0, 0]);
  assert.equal(plan.changes[0].invoice_paid_after_cents, 48000);
  const empty = fixture();
  empty.payment.allocations = [];
  assert.equal(planPaymentChange({ ...empty, action: "void" }).changes.length, 0);
  assert.equal(receiptAllocationStatus(13600, 0, true).key, "voided");
});

test("requires reason, current revision and active receipt; rejects duplicates and no-op updates", () => {
  const input = fixture();
  for (const [patch, code] of [
    [{ reason: "  " }, "REASON_REQUIRED"], [{ reason: "x".repeat(1001) }, "REASON_REQUIRED"],
    [{ expectedRevision: 1 }, "STALE_PAYMENT"],
    [{ payment: { ...input.payment, voided_at: new Date() } }, "PAYMENT_VOIDED"],
    [{ allocations: [allocation(invoiceA, 0), allocation(invoiceA, 0)] }, "DUPLICATE_INVOICE"],
    [{ allocations: [allocation(invoiceA, 10476)] }, "NO_CHANGES"],
  ] as const) assert.throws(() => planPaymentChange({ ...input, ...patch, allocations: "allocations" in patch ? [...patch.allocations] : input.allocations }), errorCode(code));
});

test("rejects negative/fractional money, receipt over-allocation and invoice overpayment", () => {
  for (const amount of [-1, 1.5, NaN, Infinity, 2147483648]) {
    assert.throws(() => planPaymentChange({ ...fixture(), allocations: [allocation(invoiceB, amount)] }), errorCode("INVALID_AMOUNT"));
  }
  assert.throws(() => planPaymentChange({ ...fixture(), allocations: [allocation(invoiceB, 13601)] }), errorCode("ALLOCATION_EXCEEDS_PAYMENT"));
  assert.throws(() => planPaymentChange({ ...fixture(), allocations: [allocation(invoiceA, 10477)] }), errorCode("ALLOCATION_EXCEEDS_BALANCE"));
});

test("enforces receipt and invoice ownership; admin can make cross-owner corrections", () => {
  assert.throws(() => planPaymentChange({ ...fixture(), scope: { ownerId: "wrong", isAdmin: false } }), errorCode("PAYMENT_NOT_FOUND"));
  const input = fixture();
  input.invoices[1].clerk_user_id = "other-owner";
  assert.throws(() => planPaymentChange(input), errorCode("INVOICE_NOT_FOUND"));
  assert.equal(planPaymentChange({ ...input, scope: { ownerId: "admin", isAdmin: true } }).remaining, 2124);
});

test("changed Bill To or void invoice can be released but cannot receive an increase", () => {
  for (const mode of ["company", "void"]) {
    const input = fixture();
    if (mode === "company") input.invoices[1].case.bill_to_company = "Different";
    else input.invoices[1].payment_status = "VOID";
    assert.equal(planPaymentChange(input).remaining, 2124);
    if (mode === "void") assert.equal(planPaymentChange(input).changes[0].payment_status, "VOID");
    assert.throws(() => planPaymentChange({ ...input, allocations: [allocation(invoiceA, 0), allocation(invoiceB, 13600)] }), errorCode(mode === "company" ? "BILL_TO_MISMATCH" : "INVOICE_VOID"));
  }
});

test("releases remain possible if an invoice total was reduced below amounts already paid", () => {
  const input = fixture();
  input.invoices[0].grand_total_cents = 50000;
  const plan = planPaymentChange({ ...input, allocations: [allocation(invoiceA, 8000)] });
  assert.equal(plan.changes[0].invoice_paid_after_cents, 56000);
  assert.equal(plan.changes[0].payment_status, "PAID");
});

test("request schema allows zero replacement amounts and both legacy IDs and UUIDs", () => {
  assert.equal(changePaymentSchema.safeParse({ action: "adjust", expected_revision: 0, reason: "撤回", allocations: [allocation(invoiceA, 0), allocation(invoiceB, 1)] }).success, true);
  assert.equal(changePaymentSchema.safeParse({ action: "void", expected_revision: 0, reason: "退票" }).success, true);
  for (const patch of [{ reason: " " }, { expected_revision: undefined }, { allocations: [] }, { allocations: [allocation("invalid", 0)] }, { allocations: [allocation(invoiceA, -1)] }]) {
    assert.equal(changePaymentSchema.safeParse({ action: "adjust", expected_revision: 0, reason: "撤回", allocations: [allocation(invoiceA, 0)], ...patch }).success, false);
  }
  const staleClient = continuePaymentSchema.safeParse({ expected_allocated_cents: 0, allocations: [allocation(invoiceA, 1)] });
  assert.equal(staleClient.success, false);
  if (!staleClient.success) assert.match(reconciliationInputError(staleClient.error, ""), /版本/);
});

const viewInvoices: AdjustmentInvoice[] = fixture().invoices.map((invoice, index) => ({ ...invoice, issued_at: "2026-09-15", allocated_cents: index === 0 ? 10476 : 3124, other_paid_cents: index === 0 ? 48000 : 0, max_allocation_cents: index === 0 ? 10476 : 149845, case: { plate: null, unit_number: null } }));
test("adjustment UI calculates replacement differences, not additive allocations", () => {
  const unchanged = adjustmentPreview(viewInvoices, { [invoiceA]: "104.76", [invoiceB]: "31.24" }, 13600, 13600);
  assert.equal(unchanged.changes.length, 0);
  assert.equal(unchanged.total, 13600);
  const moved = adjustmentPreview(viewInvoices, { [invoiceA]: "0", [invoiceB]: "136.00" }, 13600, 13600);
  assert.equal(moved.invalid, false);
  assert.equal(moved.remaining, 0);
  assert.equal(adjustmentPreview(viewInvoices, {}, 13600, 13600).remaining, 13600);
  assert.equal(adjustmentPreview(viewInvoices, { [invoiceA]: "104.77", [invoiceB]: "0" }, 13600, 13600).invalid, true);
  assert.equal(adjustmentPreview(viewInvoices, { [invoiceA]: "bad", [invoiceB]: "0" }, 13600, 13600).invalid, true);
  assert.equal(adjustmentPreview(viewInvoices, { [invoiceA]: "104.76", [invoiceB]: "50" }, 13600, 13600).invalid, true);
});

test("adjustment views prioritize linked invoices and retain amounts when filtering", () => {
  const unallocated = { ...viewInvoices[1], id: "unallocated", allocated_cents: 0, invoice_number: "INV-NEW" };
  const invoices = [unallocated, ...viewInvoices];
  const amounts = { [invoiceA]: "0", [invoiceB]: "31.24", unallocated: "25" };
  assert.deepEqual(filterAdjustmentInvoices(invoices, amounts, "allocated", "").map((invoice) => invoice.id), [invoiceA, invoiceB]);
  assert.deepEqual(filterAdjustmentInvoices(invoices, amounts, "all", "").map((invoice) => invoice.id), [invoiceA, invoiceB, "unallocated"]);
  assert.deepEqual(filterAdjustmentInvoices(invoices, amounts, "changed", "").map((invoice) => invoice.id), [invoiceA, "unallocated"]);
  assert.equal(filterAdjustmentInvoices(invoices, amounts, "all", "inv-new")[0].id, "unallocated");
  assert.equal(invoices[0].id, "unallocated");
  assert.equal(amounts[invoiceA], "0");
  assert.equal(filterAdjustmentInvoices(invoices, { ...amounts, [invoiceB]: "bad" }, "changed", "").length, 3);
});

test("adjustment feedback explains empty and invalid submissions without blocking full withdrawal", () => {
  assert.equal(adjustmentFeedback(adjustmentPreview(viewInvoices, {}, 13600, 13600)), "");
  assert.match(adjustmentFeedback(adjustmentPreview(viewInvoices, { [invoiceA]: "104.76", [invoiceB]: "31.24" }, 13600, 13600)), /尚未修改/);
  assert.match(adjustmentFeedback(adjustmentPreview(viewInvoices, { [invoiceA]: "104.76", [invoiceB]: "32" }, 13600, 13600)), /超过收款/);
  assert.match(adjustmentFeedback(adjustmentPreview(viewInvoices, { [invoiceA]: "bad", [invoiceB]: "0" }, 13600, 13600)), /标红/);
});
