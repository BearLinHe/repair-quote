import assert from "node:assert/strict";
import test from "node:test";
import { allocateVisibleInvoices, allocationTotals, AllocationInvoice, filterAllocationInvoices, parsePaymentCents, receiptAllocationStatus } from "../src/lib/reconciliation-view";

const invoices: AllocationInvoice[] = [
  { id: "new", invoice_number: "INV-002", issued_at: "2026-09-14T12:00:00", grand_total_cents: 23000, paid_cents: 0, outstanding_cents: 23000, case: { plate: "ABC", unit_number: null } },
  { id: "old", invoice_number: "INV-001", issued_at: "2026-01-01T12:00:00", grand_total_cents: 27000, paid_cents: 0, outstanding_cents: 27000, case: { plate: "XYZ", unit_number: null } },
];

test("payment amount parser preserves cents and rejects invalid or oversized money", () => {
  assert.equal(parsePaymentCents("480"), 48000);
  assert.equal(parsePaymentCents("210.10"), 21010);
  assert.equal(parsePaymentCents("1."), 100);
  assert.equal(parsePaymentCents(""), 0);
  for (const value of ["-1", "NaN", "1.001", "1e3", "Infinity", "21474836.48"]) assert.equal(parsePaymentCents(value), null);
});

test("new receipt can be saved without allocating and stays distinct from invoice status", () => {
  assert.deepEqual(allocationTotals(invoices, {}, 48000), { selected: [], total: 0, remaining: 48000, invalid: false });
  assert.equal(receiptAllocationStatus(48000, 0).label, "待分配");
  assert.equal(receiptAllocationStatus(48000, 21000).label, "部分分配");
  assert.equal(receiptAllocationStatus(48000, 48000).label, "全部分配");
});

test("partial invoice allocation leaves $20 owed and $270 receipt balance", () => {
  const result = allocationTotals(invoices, { new: "210" }, 48000);
  assert.equal(result.total, 21000);
  assert.equal(result.remaining, 27000);
  assert.equal(result.invalid, false);
  assert.equal(invoices[0].outstanding_cents - result.selected[0].amount_cents, 2000);
  assert.equal(allocationTotals(invoices, { new: "231" }, 48000).invalid, true);
  assert.equal(allocationTotals(invoices, { new: "230", old: "270" }, 48000).remaining, -2000);
});

test("invoice filters default to all dates, sort oldest first, and search independently", () => {
  assert.deepEqual(filterAllocationInvoices(invoices, "", "", "").map((item) => item.id), ["old", "new"]);
  assert.deepEqual(filterAllocationInvoices(invoices, "abc", "", "").map((item) => item.id), ["new"]);
  assert.deepEqual(filterAllocationInvoices(invoices, "", "2026-09-01", "2026-09-14").map((item) => item.id), ["new"]);
  assert.deepEqual(filterAllocationInvoices(invoices, "", "2026-09-15", "2026-09-01"), []);
});

test("oldest-first allocation uses only available receipt balance", () => {
  const visible = filterAllocationInvoices(invoices, "", "", "");
  const amounts = allocateVisibleInvoices(invoices, visible, {}, 48000);
  assert.deepEqual(amounts, { old: "270.00", new: "210.00" });
  assert.equal(allocationTotals(invoices, amounts, 48000).remaining, 0);
});

test("filtering does not discard hidden allocations or over-allocate the receipt", () => {
  const visible = filterAllocationInvoices(invoices, "ABC", "", "");
  const amounts = allocateVisibleInvoices(invoices, visible, { old: "270.00", new: "1.00" }, 48000);
  assert.deepEqual(amounts, { old: "270.00", new: "210.00" });
  assert.equal(allocationTotals(invoices, amounts, 48000).total, 48000);
});
