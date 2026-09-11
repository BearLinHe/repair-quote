import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildInvoiceExportBuffer } from "../src/lib/invoice-export";

test("exports one formatted Excel row per invoice", async () => {
  const buffer = await buildInvoiceExportBuffer([{
    invoice_number: "20260902131998",
    issued_at: new Date("2026-09-02T12:00:00Z"),
    parts_revenue_cents: 52000,
    labor_revenue_cents: 150000,
    cleaning_fee_cents: 20000,
    tax_cents: 655157,
    grand_total_cents: 63349,
    payment_status: "PAID",
    snapshot: {
      bill_to_company: "长途",
      payment_method: "Zelle",
      unit_number: "3177",
      parts: [{ name: "轮胎", qty: 2, line_total_cents: 52000 }],
      labor: [],
    },
    case: { bill_to_company: null, payment_method: null, plate: null, unit_number: null },
  }]);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Invoice 明细");
  assert.ok(sheet);
  assert.deepEqual((sheet.getRow(1).values as unknown[]).slice(1), ["Date", "部门", "Mode", "Number", "Amount", "Details", "Status", "Memo"]);
  assert.equal(sheet.getCell("B2").value, "长途");
  assert.equal(sheet.getCell("C2").value, "Truck");
  assert.equal(sheet.getCell("D2").value, "3177");
  assert.equal(sheet.getCell("E2").value, 633.49);
  assert.match(String(sheet.getCell("F2").value), /轮胎 × 2: \$520\.00/);
  assert.equal(sheet.getCell("G2").value, "已付款");
  assert.match(String(sheet.getCell("H2").value), /付款方式：Zelle/);
  assert.equal(sheet.getColumn(5).numFmt, '"$"#,##0.00');
  assert.equal(sheet.getCell("A1").alignment.horizontal, "center");
  assert.equal(sheet.getCell("A2").alignment.horizontal, "center");
  assert.equal(sheet.getCell("E2").alignment.horizontal, "center");
  assert.equal(sheet.getCell("G2").alignment.horizontal, "center");
  assert.equal(sheet.getCell("F2").alignment.horizontal, "left");
  assert.equal(sheet.getCell("H2").alignment.horizontal, "left");
  assert.equal(sheet.getCell("A2").alignment.vertical, "middle");
  assert.ok(sheet.autoFilter);
});
