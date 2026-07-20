import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { generateCasePdf } from "../src/lib/pdf";

test("creates additional pages for long invoices", async () => {
  const { pdfBytes } = await generateCasePdf({
    companyName: "YaoYuan Inc.",
    invoiceNumber: "2026071712345678",
    date: new Date("2026-07-17T12:00:00Z"),
    plate: "TEST-001",
    vin: null,
    unit_number: "A-1",
    driver_name: "Test Driver",
    driver_phone: null,
    status: "IN_PROGRESS",
    repairItems: Array.from({ length: 25 }, (_, index) => `Repair item ${index + 1}`),
    parts: Array.from({ length: 80 }, (_, index) => ({
      name: `Part ${index + 1}`,
      qty: 1,
      unit_price_cents: 100,
      line_total_cents: 100,
    })),
    labor: Array.from({ length: 30 }, (_, index) => ({
      name: `Labor ${index + 1}`,
      hours: 1,
      rate_cents: 5000,
      line_total_cents: 5000,
    })),
    labor_subtotal_cents: 150_000,
    cleaning_fee_cents: 20_000,
    tax_cents: 19_135,
    grand_total_cents: 197_135,
  });

  const document = await PDFDocument.load(pdfBytes);
  assert.ok(document.getPageCount() > 1);
});
