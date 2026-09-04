import assert from "node:assert/strict";
import test from "node:test";
import { availableQuantity, weightedAverageCost } from "../src/lib/inventory";
import { generatePurchaseNumber } from "../src/lib/purchase-number";

test("calculates available inventory after reservations", () => {
  assert.equal(availableQuantity(10, 3), 7);
});

test("calculates moving weighted-average inventory cost", () => {
  assert.equal(weightedAverageCost(10, 1000, 10, 1400), 1200);
  assert.equal(weightedAverageCost(0, 0, 5, 725), 725);
});

test("creates purchase numbers with a Los Angeles date prefix", () => {
  const number = generatePurchaseNumber(new Date("2026-09-04T06:30:00Z"));
  assert.match(number, /^PO-20260903-\d{4}$/);
});
