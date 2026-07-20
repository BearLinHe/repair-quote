import assert from "node:assert/strict";
import test from "node:test";
import { generateInvoiceNumber, invoiceDatePrefix } from "../src/lib/invoice-number";

test("uses the Los Angeles calendar date for invoice numbers", () => {
  const instant = new Date("2026-07-20T06:30:00Z");
  assert.equal(invoiceDatePrefix(instant), "20260719");
});

test("creates YYYYMMDD followed by exactly eight digits", () => {
  const number = generateInvoiceNumber(new Date("2026-07-20T12:00:00Z"), 42);
  assert.equal(number, "2026072000000042");
  assert.match(number, /^\d{16}$/);
});
