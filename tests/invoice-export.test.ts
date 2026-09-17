import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildInvoiceExportBuffer } from "../src/lib/invoice-export";
import { selectedInvoiceExportSchema } from "../src/lib/invoice-export-input";

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

test("mixed legacy and UUID selection exports all 89 invoices with matching amounts and invoice numbers", async () => {
  const invoices = Array.from({ length: 89 }, (_, index) => ({
    id: index < 32
      ? index.toString(16).padStart(32, "0")
      : `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    invoice_number: `TEST-${index + 1}`,
    issued_at: new Date("2026-09-17T12:00:00Z"),
    parts_revenue_cents: 10000 + index,
    labor_revenue_cents: 2000,
    cleaning_fee_cents: 1000,
    tax_cents: 500,
    grand_total_cents: 13500 + index,
    payment_status: "UNPAID",
    snapshot: {},
    case: { bill_to_company: "Export Test", payment_method: "check", plate: null, unit_number: String(index + 1) },
  }));
  const selected = selectedInvoiceExportSchema.parse({ ids: invoices.map((invoice) => invoice.id) });
  const selectedIds = new Set(selected.ids);
  const buffer = await buildInvoiceExportBuffer(invoices.filter((invoice) => selectedIds.has(invoice.id)));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Invoice 明细");
  assert.ok(sheet);
  assert.equal(sheet.rowCount, 90);
  let exportedTotalCents = 0;
  invoices.forEach((invoice, index) => {
    const row = sheet.getRow(index + 2);
    assert.equal(row.getCell(5).value, invoice.grand_total_cents / 100);
    assert.equal(row.getCell(8).value, `Invoice #${invoice.invoice_number}\n付款方式：check`);
    exportedTotalCents += Math.round(Number(row.getCell(5).value) * 100);
  });
  assert.equal(exportedTotalCents, invoices.reduce((sum, invoice) => sum + invoice.grand_total_cents, 0));
});
