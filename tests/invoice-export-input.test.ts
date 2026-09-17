import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { invoiceExportInputError, selectedInvoiceExportSchema } from "../src/lib/invoice-export-input";

const legacyId = "0123456789abcdef0123456789abcdef";
const uuidId = "cc7e8c88-61d9-4c85-bd09-a4d7da40a884";

function validationMessage(input: unknown) {
  const result = selectedInvoiceExportSchema.safeParse(input);
  assert.equal(result.success, false);
  if (result.success) throw new Error("Expected invalid export input");
  return invoiceExportInputError(result.error);
}

test("selected export accepts legacy IDs, UUIDs and mixed selections without changing IDs", () => {
  for (const ids of [[legacyId], [uuidId], [legacyId, uuidId], [legacyId.toUpperCase(), uuidId.toUpperCase()]]) {
    assert.deepEqual(selectedInvoiceExportSchema.parse({ ids }).ids, ids);
  }
});

test("89 selected invoices including 32 legacy IDs pass export validation", () => {
  const ids = Array.from({ length: 89 }, (_, index) => index < 32 ? randomBytes(16).toString("hex") : randomUUID());
  assert.deepEqual(selectedInvoiceExportSchema.parse({ ids }).ids, ids);
});

test("export accepts supported page sizes and enforces the existing 300-invoice limit", () => {
  for (const count of [20, 50, 100, 200, 300]) {
    const ids = Array.from({ length: count }, () => randomUUID());
    assert.equal(selectedInvoiceExportSchema.parse({ ids }).ids.length, count);
  }
  assert.match(validationMessage({ ids: Array.from({ length: 301 }, () => randomUUID()) }), /最多导出 300/);
});

test("empty selection, malformed request and duplicate IDs have distinct errors", () => {
  assert.equal(validationMessage({ ids: [] }), "请选择需要导出的 Invoice");
  for (const input of [null, {}, { ids: null }, { ids: legacyId }]) {
    assert.match(validationMessage(input), /导出参数无效/);
  }
  for (const ids of [[legacyId, legacyId], [uuidId, uuidId]]) {
    assert.match(validationMessage({ ids }), /重复选择/);
  }
});

test("invalid IDs never masquerade as an empty selection", () => {
  for (const id of ["", "123", "../../invoice", "x".repeat(32), legacyId.slice(1), `${legacyId}0`, ` ${legacyId}`, `${uuidId}extra`, 123, null]) {
    assert.match(validationMessage({ ids: [uuidId, id] }), /标识格式不正确/);
  }
});
