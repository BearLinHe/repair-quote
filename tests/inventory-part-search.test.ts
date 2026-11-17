import test from "node:test";
import assert from "node:assert/strict";
import { nextAvailablePartId, searchInventoryParts } from "../src/lib/inventory-part-search";

const parts = [
  { id: "empty", sku: "SYT668", name: "11R ALL POSITION TIRE / 全轮位轮胎", available_qty: 0, is_active: true },
  { id: "tire", sku: "SYT705", name: "11R DRIVE TIRE / 驱动轮胎", available_qty: 18, is_active: true },
  { id: "sensor", sku: "005F/DDE EA0101538128", name: "NOX SENSOR OUTLET / 出口氮氧传感器", available_qty: 2, is_active: true },
  { id: "rivet", sku: "GPCRAAP-8-6", name: "1/4X.251-.375 GRIP ALUM SMALL / 小号铝铆钉", available_qty: 1, is_active: true },
  { id: "inactive", sku: "SYT705-OLD", name: "11R DRIVE TIRE", available_qty: 5, is_active: false },
  { id: "negative", sku: "NEG-1", name: "SENSOR / 传感器", available_qty: -1, is_active: true },
];

test("parts search matches partial SKUs, English, Chinese and mixed keywords", () => {
  for (const query of ["015381", "nox outlet", "出口", "005f 传感器", "  ＮＯＸ　 OUTLET "]) {
    assert.deepEqual(searchInventoryParts(parts, query).map((item) => item.id), ["sensor"]);
  }
  assert.deepEqual(searchInventoryParts(parts, "tire 11r").map((item) => item.id), ["tire", "empty"]);
  assert.deepEqual(searchInventoryParts(parts, "gpcr 铆钉").map((item) => item.id), ["rivet"]);
  assert.deepEqual(searchInventoryParts(parts, "not-found"), []);
  assert.deepEqual(searchInventoryParts(parts, "tire sensor"), []);
});

test("search prioritizes available stock, excludes inactive parts and never mutates data", () => {
  const original = structuredClone(parts);
  assert.deepEqual(searchInventoryParts(parts, " \t ").map((item) => item.id), ["tire", "sensor", "rivet", "empty", "negative"]);
  assert.deepEqual(parts, original);
  assert.equal(searchInventoryParts(parts, "SYT705")[0], parts[1]);
  assert.deepEqual(searchInventoryParts([], "tire"), []);
});

test("keyboard navigation skips zero/negative stock and inactive options, and wraps", () => {
  assert.equal(nextAvailablePartId(parts, "", 1), "tire");
  assert.equal(nextAvailablePartId(parts, "", -1), "rivet");
  assert.equal(nextAvailablePartId(parts, "tire", 1), "sensor");
  assert.equal(nextAvailablePartId(parts, "tire", -1), "rivet");
  assert.equal(nextAvailablePartId(parts, "rivet", 1), "tire");
  assert.equal(nextAvailablePartId([parts[0], parts[4], parts[5]], "", 1), "");
  assert.equal(nextAvailablePartId(searchInventoryParts(parts, "NOX"), "rivet", 1), "sensor");
});
