import test from "node:test";
import assert from "node:assert/strict";
import { importKey, moneyCents, reviewedInvoiceSchema, suggestInventoryItem, validateReviewedInvoice, type ReviewedInvoice } from "../src/lib/purchase-import";
import { validatedImageHash } from "../src/lib/purchase-import-server";

export function sampleReview(): ReviewedInvoice {
  const source = [
    ["EA0101538128", "NOX SENSOR OUTLET", 1, "446.83", "446.83"],
    ["EA0101538128-CORE", "NOX SENSOR OUTLET", 1, "125.00", "125.00"],
    ["EA0101531928", "NOX SENSOR INLET", 1, "419.47", "419.47"],
    ["EA0101531928-CORE", "NOX SENSOR INLET", 1, "125.00", "125.00"],
    ["A0111531328", "SOOT SENSOR", 1, "300.48", "300.48"],
    ["A0004902241", "EXH CLAMP", 2, "131.80", "263.60"],
    ["A6809950202", "CLAMP V-BAND DPF", 2, "60.46", "120.92"],
    ["A4720700746", "INJ VALVE", 1, "217.80", "217.80"],
  ] as const;
  return { supplier: "GOLDEN GATE TRUCK CENTER", invoice_number: "FA005423006:01", invoice_date: "2026-09-24", currency: "USD", subtotal: "2019.10", tax: "217.05", shipping: "0.00", surcharge: "0.00", total: "2236.15", notes: "", confirmed: true,
    lines: source.map(([part, description, qty, unit_price, line_amount]) => ({ item_number: `005F/DDE ${part}`, description, qty, unit_price, line_amount, kind: part.endsWith("-CORE") ? "CORE" : "PART", inventory_item_id: null, new_sku: `005F/DDE ${part}`, unit: "个" })),
  };
}

test("sample invoice keeps six stock parts/eight units separate from CORE and taxes", () => {
  const review = reviewedInvoiceSchema.parse(sampleReview());
  assert.deepEqual(validateReviewedInvoice(review), []);
  const parts = review.lines.filter((line) => line.kind === "PART");
  assert.equal(parts.length, 6);
  assert.equal(parts.reduce((sum, line) => sum + line.qty, 0), 8);
  assert.equal(parts.reduce((sum, line) => sum + moneyCents(line.line_amount)!, 0), 176910);
  assert.equal(review.lines.filter((line) => line.kind === "CORE").reduce((sum, line) => sum + moneyCents(line.line_amount)!, 0), 25000);
});

test("money parser rejects malformed, negative, fractional-cent and oversized input", () => {
  assert.equal(moneyCents("131.80"), 13180);
  assert.equal(moneyCents("0.1"), 10);
  for (const invalid of ["", "1,000", "1e3", "Infinity", "-1", "0.001", "$5", "99999999.99"]) assert.equal(moneyCents(invalid), null);
});

test("confirmation, real dates, integer quantities and positive money are required", () => {
  for (const patch of [{ confirmed: false }, { invoice_date: "2026-02-30" }, { currency: "CAD" }, { total: "" }]) assert.equal(reviewedInvoiceSchema.safeParse({ ...sampleReview(), ...patch }).success, false);
  const sample = sampleReview(); sample.lines[0].qty = 1.5;
  assert.equal(reviewedInvoiceSchema.safeParse(sample).success, false);
});

test("deterministic validation catches list-price errors, total mismatches, unknown SKU and CORE stock", () => {
  const sample = sampleReview(); sample.lines[0].unit_price = "467.48";
  assert.match(validateReviewedInvoice(sample).join(), /第 1 行/);
  sample.lines[0].new_sku = "";
  sample.lines[1].kind = "PART";
  sample.total = "2019.10";
  const issues = validateReviewedInvoice(sample).join();
  assert.match(issues, /SKU/); assert.match(issues, /CORE/); assert.match(issues, /总额/);
});

test("SKU matching preserves supplier prefix/core suffix and only auto-suggests exact matches", () => {
  const items = [{ id: "a", sku: "A1", name: "Part one", unit: "个" }, { id: "b", sku: "DDE A1", name: "Other part", unit: "个" }];
  assert.equal(suggestInventoryItem(" a1 ", items)?.id, "a");
  assert.equal(suggestInventoryItem("DDE A1", items)?.id, "b");
  assert.equal(suggestInventoryItem("A1-CORE", items), null);
  assert.equal(suggestInventoryItem("005F/DDE A1", items), null);
  assert.equal(suggestInventoryItem("005F/DDE A1", items, "a")?.id, "a");
  assert.equal(suggestInventoryItem("A1", [...items, { ...items[0], id: "c" }]), null);
  assert.equal(importKey("  GOlden  Gate "), "GOLDEN GATE");
});

test("duplicate detection hashes bytes; uploads reject fake or oversized images", () => {
  const tinyJpeg = `data:image/jpeg;base64,${Buffer.from([255, 216, 255, 0]).toString("base64")}`;
  assert.equal(validatedImageHash(tinyJpeg), validatedImageHash(tinyJpeg));
  assert.throws(() => validatedImageHash("data:image/jpeg;base64,AAAA"));
  assert.throws(() => validatedImageHash("https://example.com/photo.jpg"));
  assert.throws(() => validatedImageHash("data:image/jpeg;base64," + "A".repeat(3_200_000)));
});
