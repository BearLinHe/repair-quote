import assert from "node:assert/strict";
import test from "node:test";
import { financeDatePreset, financeDateValue, financeMidnight } from "../src/lib/finance-dates";
import { financeInvoiceWhere, parseFinanceFilters, paymentMethodOptions } from "../src/lib/finance-query";

test("finance presets use business-local dates across year and leap-month boundaries", () => {
  const now = new Date("2026-01-01T06:00:00Z");
  assert.equal(financeDateValue(now), "2025-12-31");
  assert.deepEqual(financeDatePreset("today", now), { start: "2025-12-31", end: "2025-12-31" });
  assert.deepEqual(financeDatePreset("week", now), { start: "2025-12-25", end: "2025-12-31" });
  assert.deepEqual(financeDatePreset("month", now), { start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(financeDatePreset("previousMonth", new Date("2024-03-15T12:00:00Z")), { start: "2024-02-01", end: "2024-02-29" });
});

test("date range includes the entire end date and handles both DST transitions", () => {
  for (const [day, start, end] of [
    ["2026-09-22", "2026-09-22T07:00:00.000Z", "2026-09-23T07:00:00.000Z"],
    ["2026-03-08", "2026-03-08T08:00:00.000Z", "2026-03-09T07:00:00.000Z"],
    ["2026-11-01", "2026-11-01T07:00:00.000Z", "2026-11-02T08:00:00.000Z"],
  ]) {
    const where = financeInvoiceWhere({}, { start: day, end: day });
    assert.deepEqual(where.issued_at, { gte: new Date(start), lt: new Date(end) });
    assert.equal(financeMidnight(day).toISOString(), start);
  }
});

test("finance filters reject malformed dates, reversed ranges and conflicting payment methods", () => {
  for (const query of ["start=2026-02-30&end=2026-03-01", "start=2026-9-1", "start=0000-01-01", "end=garbage", "start=2026-09-23&end=2026-09-22", "payment_method=Cash&payment_method_missing=1"]) {
    assert.equal(parseFinanceFilters(new URLSearchParams(query)).success, false, query);
  }
  assert.equal(parseFinanceFilters(new URLSearchParams("start=2024-02-29&end=2024-02-29")).success, true);
});

test("combined filters keep owner scope, use case-insensitive exact method and fuzzy company matching", () => {
  const parsed = parseFinanceFilters(new URLSearchParams("start=2026-09-01&end=2026-09-22&bill_to=%20TRUCK%20&payment_method=%20check%20"));
  assert.ok(parsed.success);
  const where = financeInvoiceWhere({ clerk_user_id: "owner" }, parsed.data);
  assert.equal(where.clerk_user_id, "owner");
  assert.deepEqual(where.case, { bill_to_company: { contains: "TRUCK", mode: "insensitive" }, payment_method: { equals: "check", mode: "insensitive" } });
  assert.deepEqual(financeInvoiceWhere({}, { start: "2026-09-01", end: "2026-09-22", payment_method_missing: "1" }).case, { OR: [{ payment_method: null }, { payment_method: "" }] });
  assert.deepEqual(paymentMethodOptions([null, "", " Cash ", "cash", "Check", "Zelle"]), ["Cash", "Check", "Zelle"]);
});
