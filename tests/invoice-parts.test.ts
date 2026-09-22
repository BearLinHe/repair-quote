import assert from "node:assert/strict";
import test from "node:test";
import { invoicePartUsage, invoicePartUsageText } from "../src/lib/invoice-parts";

test("invoice parts use saved invoice lines without double-counting case lines", () => {
  const parts = invoicePartUsage({ parts: [{ name: " 轮胎 ", qty: 2 }, { name: "刹车片", qty: 4 }] }, [{ name: "轮胎", qty: 8 }]);
  assert.deepEqual(parts, [{ name: "轮胎", qty: 2 }, { name: "刹车片", qty: 4 }]);
  assert.equal(invoicePartUsageText(parts), "轮胎 × 2\n刹车片 × 4");
});

test("legacy snapshots fall back to case parts, but explicit empty snapshots stay empty", () => {
  const fallback = [{ name: "Tire", qty: 2 }];
  for (const snapshot of [null, {}, { parts: null }]) assert.deepEqual(invoicePartUsage(snapshot, fallback), fallback);
  assert.deepEqual(invoicePartUsage({ parts: [] }, fallback), []);
});

test("malformed historical quantities are shown as unknown rather than fabricated", () => {
  const parts = invoicePartUsage({ parts: [null, "invalid", { name: "" }, { name: "A" }, { name: "B", qty: -1 }, { name: "C", qty: NaN }, { name: "D", qty: 0 }] });
  assert.deepEqual(parts, [{ name: "A", qty: null }, { name: "B", qty: null }, { name: "C", qty: null }, { name: "D", qty: 0 }]);
  assert.match(invoicePartUsageText(parts), /数量未记录/);
});
