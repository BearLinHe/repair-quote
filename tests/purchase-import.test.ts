import test from "node:test";
import assert from "node:assert/strict";
import { zodTextFormat } from "openai/helpers/zod";
import { defaultPurchaseSku, existingPurchaseItemName, extractedInvoiceSchema, importKey, moneyCents, purchaseItemName, purchaseLineDefaults, purchaseLineNumberPatch, reviewedInvoiceSchema, storedExtractedInvoiceSchema, suggestInventoryItem, validateReviewedInvoice, type ReviewedInvoice } from "../src/lib/purchase-import";
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

test("full part number defaults to SKU and neither truncates nor loses CORE suffixes", () => {
  assert.equal(defaultPurchaseSku(" 005F/DDE EA0101538128-CORE "), "005F/DDE EA0101538128-CORE");
  assert.equal(defaultPurchaseSku(null), "");
  assert.equal(defaultPurchaseSku("X".repeat(50)), "X".repeat(50));
  assert.equal(defaultPurchaseSku("X".repeat(51)), "");
  assert.deepEqual(purchaseLineDefaults({ item_number: "005F/DDE A1", description: "NOX SENSOR OUTLET", description_zh: "出口 NOX 传感器" }), {
    item_number: "005F/DDE A1", description: "NOX SENSOR OUTLET", description_zh: "出口 NOX 传感器", new_sku: "005F/DDE A1",
  });
  assert.equal(purchaseLineDefaults({ item_number: "A1", description: "Sensor" }).description_zh, "");
});

test("editing a part number updates only the default SKU and exact inventory match", () => {
  const items = [{ id: "existing", sku: "DDE A2", name: "Sensor", unit: "个" }];
  const patch = purchaseLineNumberPatch({ item_number: "DDE A1", new_sku: "DDE A1" }, "DDE A2", items);
  assert.equal(patch.new_sku, "DDE A2");
  assert.equal(patch.inventory_item_id, "existing");
  assert.equal(patch.match, "SKU 完整匹配");
  const custom = purchaseLineNumberPatch({ item_number: "DDE A1", new_sku: "CUSTOM-SKU" }, "DDE A2", items);
  assert.equal(custom.new_sku, "CUSTOM-SKU");
  assert.equal(custom.inventory_item_id, null);
  assert.equal(purchaseLineNumberPatch({ item_number: "", new_sku: "" }, "A1", items).new_sku, "A1");
  assert.equal(purchaseLineNumberPatch({ item_number: "A1", new_sku: "A1" }, "X".repeat(51), items).new_sku, "");
  assert.equal(purchaseLineNumberPatch({ item_number: "DDE A1", new_sku: "DDE A1" }, "A2", items).inventory_item_id, null);
});

test("AI requires a separate nullable translation, while old extraction records stay readable", () => {
  const legacy = {
    supplier: "Test", invoice_number: "A1", invoice_date: "2026-09-29", currency: "USD", subtotal: "10.00", tax: "0.00", shipping: "0.00", surcharge: "0.00", total: "10.00", warnings: [],
    lines: [{ item_number: "DDE A1", description: "NOX SENSOR OUTLET", shipped_qty: 1, backordered_qty: 0, unit_price: "10.00", line_amount: "10.00", kind: "PART", warning: null }],
  };
  assert.equal(extractedInvoiceSchema.safeParse(legacy).success, false);
  const stored = storedExtractedInvoiceSchema.parse(legacy);
  assert.equal(stored.lines[0].description_zh, null);
  assert.equal(stored.lines[0].description, "NOX SENSOR OUTLET");
  const current = extractedInvoiceSchema.parse({ ...legacy, lines: [{ ...legacy.lines[0], description_zh: "出口 NOX 传感器" }] });
  assert.equal(current.lines[0].description_zh, "出口 NOX 传感器");
  assert.equal(current.lines[0].item_number, "DDE A1");
  const schema = JSON.parse(JSON.stringify(zodTextFormat(extractedInvoiceSchema, "supplier_invoice"))).schema;
  assert.ok(schema.properties.lines.items.required.includes("description_zh"));
});

test("bilingual names preserve the original, avoid duplicate Chinese, and remain editable", () => {
  assert.equal(purchaseItemName(" NOX SENSOR OUTLET ", " 出口 NOX 传感器 "), "NOX SENSOR OUTLET / 出口 NOX 传感器");
  assert.equal(purchaseItemName("传感器", "传感器"), "传感器");
  assert.equal(purchaseItemName("Sensor / 传感器", "传感器"), "Sensor / 传感器");
  assert.equal(purchaseItemName("Sensor", null), "Sensor");
  const legacy = sampleReview();
  assert.deepEqual(reviewedInvoiceSchema.parse(legacy), legacy);
  const review = sampleReview(); review.lines[0].description_zh = "出口 NOX 传感器";
  assert.equal(reviewedInvoiceSchema.parse(review).lines[0].description_zh, "出口 NOX 传感器");
  assert.deepEqual(validateReviewedInvoice(review), []);
  review.lines[0].description = "X".repeat(199);
  assert.match(validateReviewedInvoice(review).join(), /名称超过 200 字/);
});

test("conflicting Chinese names on one new SKU require review", () => {
  const review = sampleReview();
  review.lines[0].description_zh = "出口传感器";
  review.lines.push({ ...review.lines[0], description_zh: "入口传感器" });
  assert.match(validateReviewedInvoice(review).join(), /对应了不同名称或单位/);
});

test("existing matching English names gain reviewed Chinese without replacing the original", () => {
  assert.deepEqual(existingPurchaseItemName("NOX SENSOR OUTLET", "nox sensor outlet", " 出口 NOX 传感器 "), {
    name: "NOX SENSOR OUTLET / 出口 NOX 传感器", reason: "append",
  });
  assert.equal(existingPurchaseItemName("Exh  Clamp", "ＥＸＨ CLAMP", "排气卡箍").name, "Exh  Clamp / 排气卡箍");
});

test("existing translated or custom catalog names are preserved", () => {
  for (const name of ["NOX SENSOR OUTLET / 出口传感器", "已人工校正的名称", "Sensor（繁體譯名）"]) {
    assert.deepEqual(existingPurchaseItemName(name, "NOX SENSOR OUTLET", "新译名"), { name, reason: "has_chinese" });
  }
  assert.deepEqual(existingPurchaseItemName("NOX SENSOR INLET", "NOX SENSOR OUTLET", "出口传感器"), {
    name: "NOX SENSOR INLET", reason: "different_name",
  });
  for (const translation of [undefined, null, "", "   ", "Sensor"]) {
    assert.deepEqual(existingPurchaseItemName("SENSOR", "SENSOR", translation), { name: "SENSOR", reason: "missing_translation" });
  }
});

test("existing name enrichment is idempotent and never truncates long names", () => {
  const first = existingPurchaseItemName("SENSOR", "SENSOR", "传感器");
  assert.deepEqual(existingPurchaseItemName(first.name, "SENSOR", "传感器"), { name: first.name, reason: "has_chinese" });
  const long = "S".repeat(195);
  assert.deepEqual(existingPurchaseItemName(long, long, "传感器"), { name: long, reason: "too_long" });
  assert.equal(existingPurchaseItemName("S".repeat(194), "S".repeat(194), "传感器").name.length, 200);
});

test("different translations of one existing SKU cannot silently overwrite each other", () => {
  const review = sampleReview();
  const id = "de537577-51af-4b4d-bd72-8d0044130249";
  const line = { ...review.lines[0], inventory_item_id: id, description_zh: "出口传感器" };
  review.lines = [line, { ...line, description_zh: "入口传感器" }];
  assert.ok(validateReviewedInvoice(review).some((issue) => issue.includes("不同中文译名")));
  review.lines[1].description_zh = " 出口传感器 ";
  assert.ok(!validateReviewedInvoice(review).some((issue) => issue.includes("不同中文译名")));
  review.lines[1].description_zh = "";
  assert.ok(!validateReviewedInvoice(review).some((issue) => issue.includes("不同中文译名")));
});
