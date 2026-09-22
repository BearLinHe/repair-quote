import ExcelJS from "exceljs";
import { invoicePartUsage, invoicePartUsageText } from "./invoice-parts";
import { financeDateValue } from "./finance-dates";

type SnapshotLine = {
  name?: unknown;
  qty?: unknown;
  hours?: unknown;
  line_total_cents?: unknown;
};

type InvoiceSnapshot = {
  bill_to_company?: unknown;
  payment_method?: unknown;
  plate?: unknown;
  unit_number?: unknown;
  parts?: unknown;
  labor?: unknown;
};

export type InvoiceExportRecord = {
  invoice_number: string;
  issued_at: Date;
  parts_revenue_cents: number;
  labor_revenue_cents: number;
  cleaning_fee_cents: number;
  tax_cents: number;
  grand_total_cents: number;
  payment_status: string;
  snapshot: unknown;
  case: {
    bill_to_company: string | null;
    payment_method: string | null;
    plate: string | null;
    unit_number: string | null;
    parts?: Array<{ name: string; qty: number }>;
  };
};

const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function snapshotOf(value: unknown): InvoiceSnapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? value as InvoiceSnapshot : {};
}

function snapshotLines(value: unknown): SnapshotLine[] {
  return Array.isArray(value)
    ? value.filter((line): line is SnapshotLine => Boolean(line) && typeof line === "object" && !Array.isArray(line))
    : [];
}

function paymentStatus(value: string) {
  return ({ UNPAID: "未付款", PARTIAL: "部分付款", PAID: "已付款", VOID: "已作废" } as Record<string, string>)[value] ?? value;
}

function invoiceDetails(invoice: InvoiceExportRecord, snapshot: InvoiceSnapshot) {
  const lines: string[] = [];
  for (const part of snapshotLines(snapshot.parts)) {
    const name = asText(part.name);
    const total = asNumber(part.line_total_cents);
    if (!name || total == null) continue;
    const qty = asNumber(part.qty);
    lines.push(`${name}${qty != null ? ` × ${qty}` : ""}: ${money(total)}`);
  }
  for (const labor of snapshotLines(snapshot.labor)) {
    const name = asText(labor.name);
    const total = asNumber(labor.line_total_cents);
    if (!name || total == null) continue;
    const hours = asNumber(labor.hours);
    lines.push(`${name}${hours != null ? ` (${hours}h)` : ""}: ${money(total)}`);
  }
  if (invoice.parts_revenue_cents > 0) lines.push(`Parts Subtotal: ${money(invoice.parts_revenue_cents)}`);
  lines.push(`Labor Subtotal: ${money(invoice.labor_revenue_cents)}`);
  if (invoice.cleaning_fee_cents > 0) lines.push(`Cleaning Fee: ${money(invoice.cleaning_fee_cents)}`);
  lines.push(`Tax: ${money(invoice.tax_cents)}`);
  return lines.join("\n");
}

export async function buildInvoiceExportWorkbook(invoices: InvoiceExportRecord[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "YaoYuan Service Operations";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Invoice 明细", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { header: "Date", key: "date", width: 13 },
    { header: "部门", key: "department", width: 22 },
    { header: "Mode", key: "mode", width: 12 },
    { header: "Number", key: "number", width: 17 },
    { header: "Amount", key: "amount", width: 15 },
    { header: "Details", key: "details", width: 58 },
    { header: "Status", key: "status", width: 13 },
    { header: "Memo", key: "memo", width: 38 },
    { header: "付款方式", key: "payment_method", width: 18 },
    { header: "配件用量（名称 × 数量）", key: "part_usage", width: 40 },
  ];

  const partsSheet = workbook.addWorksheet("配件用量", { views: [{ state: "frozen", ySplit: 1 }] });
  partsSheet.columns = [
    { header: "开票日期", key: "date", width: 14 },
    { header: "Invoice", key: "invoice", width: 24 },
    { header: "Bill To", key: "bill_to", width: 28 },
    { header: "配件名称", key: "part", width: 40 },
    { header: "数量", key: "qty", width: 12 },
    { header: "付款方式", key: "payment_method", width: 18 },
  ];

  for (const invoice of invoices) {
    const snapshot = snapshotOf(invoice.snapshot);
    const department = asText(snapshot.bill_to_company) ?? invoice.case.bill_to_company ?? "-";
    const number = asText(snapshot.unit_number) ?? invoice.case.unit_number ?? asText(snapshot.plate) ?? invoice.case.plate ?? "-";
    const paymentMethod = invoice.case.payment_method?.trim() || null;
    const parts = invoicePartUsage(invoice.snapshot, invoice.case.parts);
    const date = new Date(`${financeDateValue(invoice.issued_at)}T00:00:00Z`);
    const details = invoiceDetails(invoice, snapshot);
    const row = sheet.addRow({
      date,
      department,
      mode: "Truck",
      number,
      amount: invoice.grand_total_cents / 100,
      details,
      status: paymentStatus(invoice.payment_status),
      memo: `Invoice #${invoice.invoice_number}${paymentMethod ? `\n付款方式：${paymentMethod}` : ""}`,
      payment_method: paymentMethod ?? "未填写",
      part_usage: invoicePartUsageText(parts) || "无配件",
    });
    const detailLines = Math.max(1, details.split("\n").length, parts.length);
    row.height = Math.min(132, Math.max(36, detailLines * 17));
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.getCell("details").alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.getCell("memo").alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.getCell("part_usage").alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.getCell("payment_method").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (const part of parts) partsSheet.addRow({ date, invoice: invoice.invoice_number, bill_to: department, part: part.name, qty: part.qty ?? "未记录", payment_method: paymentMethod ?? "未填写" });
  }

  const header = sheet.getRow(1);
  header.height = 28;
  header.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6B4F" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.eachCell((cell) => {
    cell.border = { right: { style: "thin", color: { argb: "FF5D8D75" } } };
  });

  sheet.getColumn("date").numFmt = "m/d/yyyy";
  sheet.getColumn("amount").numFmt = '"$"#,##0.00';
  sheet.getColumn("amount").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getColumn("status").alignment = { horizontal: "center", vertical: "middle" };
  sheet.autoFilter = { from: "A1", to: "J1" };

  partsSheet.getColumn("date").numFmt = "m/d/yyyy";
  partsSheet.autoFilter = { from: "A1", to: "F1" };
  partsSheet.eachRow((row, index) => {
    row.height = index === 1 ? 28 : 36;
    row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    row.font = { name: "Arial", size: 10, ...(index === 1 ? { bold: true, color: { argb: "FFFFFFFF" } } : {}) };
    if (index === 1) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F6B4F" } };
  });

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.font = { name: "Arial", size: 10, color: { argb: "FF17232A" } };
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFD8E2DE" } } };
    });
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F9F7" } };
      });
    }
  }

  return workbook;
}

export async function buildInvoiceExportBuffer(invoices: InvoiceExportRecord[]) {
  const workbook = await buildInvoiceExportWorkbook(invoices);
  return workbook.xlsx.writeBuffer();
}
