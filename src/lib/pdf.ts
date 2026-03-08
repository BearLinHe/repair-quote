import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
// @ts-expect-error fontkit 无类型或 default 导出
import fontkit from "@pdf-lib/fontkit";

/** 无中文字体时：Helvetica 仅支持 ASCII，非 ASCII 显示为 ?，不翻译 */
function toPdfSafe(str: string): string {
  return (str ?? "").replace(/[^\x20-\x7E]/g, "?");
}

function formatCents(c: number) {
  return `${(c / 100).toFixed(2)}`;
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
  const { height } = page.getSize();
  let y = height - 50;
  const left = 50;
  const lineHeight = 16;
  const smallLine = 12;

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const f = opts?.bold ? fontBold : font;
    const size = opts?.size ?? 12;
    page.drawText(text, { x: left, y, size, font: f, color: rgb(0, 0, 0) });
    y -= lineHeight;
  };

  draw(textForPdf(input.companyName), { bold: true, size: 18 });
  y -= 4;
  draw(`Date: ${input.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
  y -= 8;

  const vehicle: string[] = [];
  if (input.plate) vehicle.push(`Plate: ${textForPdf(input.plate)}`);
  if (input.vin) vehicle.push(`VIN: ${textForPdf(input.vin)}`);
  if (input.unit_number != null) vehicle.push(`Unit #: ${input.unit_number}`);
  if (vehicle.length) {
    draw("Vehicle: " + vehicle.join(" | "));
    y -= 4;
  }
  if (input.driver_name ?? input.driver_phone) {
    const driverParts: string[] = [];
    if (input.driver_name) driverParts.push(`Driver: ${textForPdf(input.driver_name)}`);
    if (input.driver_phone) driverParts.push(`Phone: ${textForPdf(input.driver_phone)}`);
    draw(driverParts.join(" | "));
    y -= 4;
  }
  draw(`Status: ${textForPdf(input.status)} | Grand Total: ${formatCents(input.grand_total_cents)}`);
  y -= 4;

  if (input.repairItems.length) {
    draw("Repair Items:", { bold: true });
    input.repairItems.forEach((name) => {
      page.drawText("• " + textForPdf(name), { x: left + 8, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  if (input.parts.length) {
    draw("Parts", { bold: true });
    page.drawText("Name", { x: left, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Qty", { x: left + 200, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Unit Price", { x: left + 260, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.parts.forEach((p) => {
      page.drawText(textForPdf(p.name).slice(0, 28), { x: left, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(p.qty), { x: left + 200, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.unit_price_cents), { x: left + 260, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(p.line_total_cents), { x: left + 360, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  if (input.labor.length) {
    draw("Labor", { bold: true });
    page.drawText("Name", { x: left, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Hours", { x: left + 200, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Rate", { x: left + 280, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    page.drawText("Line Total", { x: left + 360, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
    y -= smallLine;
    input.labor.forEach((l) => {
      page.drawText(textForPdf(l.name).slice(0, 28), { x: left, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(String(l.hours), { x: left + 200, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.rate_cents), { x: left + 280, y, size: 10, font, color: rgb(0, 0, 0) });
      page.drawText(formatCents(l.line_total_cents), { x: left + 360, y, size: 10, font, color: rgb(0, 0, 0) });
      y -= smallLine;
    });
    y -= 4;
  }

  draw(`Labor Subtotal: ${formatCents(input.labor_subtotal_cents)}`);
  draw(`Cleaning Fee: ${formatCents(input.cleaning_fee_cents)}`);
  draw(`Tax: ${formatCents(input.tax_cents)}`);
  draw(`Grand Total: ${formatCents(input.grand_total_cents)}`, { bold: true });
  y -= 24;

  draw("Customer Signature: _________________________________________");
  draw("Date: _________________________________________");

  const pdfBytes = await doc.save();
  return { pdfBytes, usedCustomFont: useCustomFont };
}
