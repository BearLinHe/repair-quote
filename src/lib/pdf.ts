import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

/** 无中文字体时：Helvetica 仅支持 ASCII，非 ASCII 显示为 ?，不翻译 */
function toPdfSafe(str: string): string {
  return (str ?? "").replace(/[^\x20-\x7E]/g, "?");
}

function formatCents(c: number) {
  const value = c / 100;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}`;
}

export type CasePdfInput = {
  companyName: string;
  date: Date;
  plate: string | null;
  vin: string | null;
  unit_number: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  status: string;
  repairItems: string[];
  parts: Array<{
    name: string;
    qty: number;
    unit_price_cents: number;
    line_total_cents: number;
  }>;
  labor: Array<{
    name: string;
    hours: number;
    rate_cents: number;
    line_total_cents: number;
  }>;
  labor_subtotal_cents: number;
  cleaning_fee_cents: number;
  apply_tax?: boolean;
  tax_cents: number;
  grand_total_cents: number;
  /** 可选：中文字体文件字节（如 Noto Sans SC），传入后 PDF 内中文正常显示 */
  customFontBytes?: Uint8Array;
};

export type GenerateCasePdfResult = { pdfBytes: Uint8Array; usedCustomFont: boolean };

export async function generateCasePdf(input: CasePdfInput): Promise<GenerateCasePdfResult> {
  const doc = await PDFDocument.create();
  let font: PDFFont;
  let fontBold: PDFFont;
  /** 有中文字体时直接显示原文，否则用英文/词汇表并替换非 ASCII 为 ? */
  let useCustomFont = false;
  if (input.customFontBytes && input.customFontBytes.length > 0) {
    try {
      doc.registerFontkit(fontkit);
      font = await doc.embedFont(input.customFontBytes);
      fontBold = font;
      useCustomFont = true;
    } catch (e) {
      console.warn("PDF 中文字体嵌入失败，将使用 Helvetica:", e instanceof Error ? e.message : e);
      font = await doc.embedFont(StandardFonts.Helvetica);
      fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    }
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
    fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  }
  const textForPdf = useCustomFont ? (str: string) => (str ?? "") : (str: string) => toPdfSafe(str ?? "");

  const page = doc.addPage([612, 792]);
  const { height, width } = page.getSize();
  // 整体内容稍微往下移动，避免太贴近页面顶部
  let y = height - 80;
  const left = 50;
  const lineHeight = 20;
  const smallLine = 14;

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const f = opts?.bold ? fontBold : font;
    const size = opts?.size ?? 12;
    page.drawText(text, { x: left, y, size, font: f, color: rgb(0, 0, 0) });
    y -= lineHeight;
  };

  // 标题区：公司名（左上）+ Invoice（右上）
  draw(textForPdf(input.companyName), { bold: true, size: 20 });
  const invoiceTitle = "Invoice";
  const invoiceSize = 16;
  const invoiceWidth = fontBold.widthOfTextAtSize(invoiceTitle, invoiceSize);
  page.drawText(invoiceTitle, {
    x: width - invoiceWidth - 50,
    y,
    size: invoiceSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= lineHeight;
  y -= 8;
  const d = input.date;
  const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(
    2,
    "0",
  )}/${String(d.getFullYear()).slice(-2)}`;
  draw(`Date: ${dateStr}`);
  y -= 12;

  const vehicle: string[] = [];
  if (input.plate) vehicle.push(`Plate: ${textForPdf(input.plate)}`);
  if (input.vin) vehicle.push(`VIN: ${textForPdf(input.vin)}`);
  if (input.unit_number != null) vehicle.push(`Unit #: ${input.unit_number}`);
  if (vehicle.length) {
    draw("Vehicle: " + vehicle.join(" | "));
    y -= 8;
  }
  if (input.driver_name ?? input.driver_phone) {
    const driverParts: string[] = [];
    if (input.driver_name) driverParts.push(`Driver: ${textForPdf(input.driver_name)}`);
    if (input.driver_phone) driverParts.push(`Phone: ${textForPdf(input.driver_phone)}`);
    draw(driverParts.join(" | "));
    y -= 8;
  }
  draw(`Status: ${textForPdf(input.status)} | Grand Total: ${formatCents(input.grand_total_cents)}`);
  y -= 12;

  if (input.repairItems.length) {
    draw("Repair Items:", { bold: true, size: 13 });
    input.repairItems.forEach((name) => {
      page.drawText("• " + textForPdf(name), { x: left + 8, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 10;
  }

  if (input.parts.length) {
    draw("Parts", { bold: true, size: 13 });
    page.drawText("Name", { x: left, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Qty", { x: left + 200, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Unit Price", { x: left + 260, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.parts.forEach((p) => {
      page.drawText(textForPdf(p.name).slice(0, 28), { x: left, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(String(p.qty), { x: left + 200, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.unit_price_cents), { x: left + 260, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.line_total_cents), { x: left + 360, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 10;
  }

  if (input.labor.length) {
    draw("Labor", { bold: true, size: 13 });
    page.drawText("Name", { x: left, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Hours", { x: left + 200, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Rate", { x: left + 280, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 11, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.labor.forEach((l) => {
      page.drawText(textForPdf(l.name).slice(0, 28), { x: left, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(String(l.hours), { x: left + 200, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.rate_cents), { x: left + 280, y, size: 11, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.line_total_cents), { x: left + 360, y, size: 11, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 10;
  }

  draw(`Labor Subtotal: ${formatCents(input.labor_subtotal_cents)}`);
  draw(`Cleaning Fee: ${formatCents(input.cleaning_fee_cents)}`);
  if (input.apply_tax !== false) {
    draw(`Tax: ${formatCents(input.tax_cents)}`);
  }
  draw(`Grand Total: ${formatCents(input.grand_total_cents)}`, { bold: true });

  // 签名区域固定在页面下部，避免跟上面内容太接近
  y = 80;
  page.drawText("Customer Signature: _________________________________________", {
    x: left,
    y,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 24;
  page.drawText("Date: _________________________________________", {
    x: left,
    y,
    size: 12,
    font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await doc.save();
  return { pdfBytes, usedCustomFont: useCustomFont };
}
