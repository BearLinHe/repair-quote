import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { generateCasePdf } from "../src/lib/pdf";

test("creates additional pages for long invoices", async () => {
  const { pdfBytes } = await generateCasePdf({
    companyName: "YaoYuan Inc.",
    invoiceNumber: "2026071712345678",
    date: new Date("2026-07-17T12:00:00Z"),
    billToCompany: "Example Logistics LLC",
    billToAddress: "100 Market Street, Hayward, CA 94545",
    billToContact: "Jane Doe",
    paymentMethod: "Company check",
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

test("subsets the Chinese font instead of embedding the full font file", async () => {
  const customFontBytes = new Uint8Array(await readFile("public/fonts/NotoSerifSC-Medium.ttf"));
  const { pdfBytes, usedCustomFont } = await generateCasePdf({
    companyName: "YaoYuan Inc.",
    invoiceNumber: "2026090912345678",
    date: new Date("2026-09-09T12:00:00Z"),
    billToCompany: "华运物流 / Huayun Logistics",
    billToAddress: null,
    billToContact: "王先生 / Mr. Wang",
    paymentMethod: "公司支票 / Company Check",
    plate: "TEST-002",
    vin: null,
    unit_number: null,
    driver_name: null,
    driver_phone: null,
    status: "In Progress",
    repairItems: ["更换前大灯 / Replace front headlamp"],
    parts: [],
    labor: [],
    labor_subtotal_cents: 0,
    cleaning_fee_cents: 0,
    tax_cents: 0,
    grand_total_cents: 0,
    customFontBytes,
  });

  assert.equal(usedCustomFont, true);
  assert.ok(pdfBytes.length < 500_000, `Expected a subset font PDF, received ${pdfBytes.length} bytes`);
  const document = await PDFDocument.load(pdfBytes);
  assert.equal(document.getPageCount(), 1);
});
