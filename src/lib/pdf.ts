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

function wrapText(text: string, maxWidth: number, measure: (value: string) => number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of normalized.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
    }

    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }

    let fragment = "";
    for (const char of word) {
      const fragmentCandidate = fragment + char;
      if (fragment && measure(fragmentCandidate) > maxWidth) {
        lines.push(fragment);
        fragment = char;
      } else {
        fragment = fragmentCandidate;
      }
    }
    current = fragment;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export type CasePdfInput = {
  companyName: string;
  date: Date;
  plate: string | null;
  vin: string | null;
  unit_number: string | null;
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
  apply_cleaning?: boolean;
  apply_tax?: boolean;
  tax_cents: number;
  grand_total_cents: number;
  /** 可选：中文字体文件字节（如 Noto Sans SC），传入后 PDF 内中文正常显示 */
  customFontBytes?: Uint8Array;
};

export type GenerateCasePdfResult = { pdfBytes: Uint8Array; usedCustomFont: boolean };

export async function generateCasePdf(input: CasePdfInput): Promise<GenerateCasePdfResult> {
  const doc = await PDFDocument.create();
  const latinFont = await doc.embedFont(StandardFonts.Helvetica);
  const latinFontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let font: PDFFont = latinFont;
  let fontBold: PDFFont = latinFontBold;
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
      font = latinFont;
      fontBold = latinFontBold;
    }
  } else {
    font = latinFont;
    fontBold = latinFontBold;
  }
  const textForPdf = useCustomFont ? (str: string) => (str ?? "") : (str: string) => toPdfSafe(str ?? "");

  let page = doc.addPage([612, 792]);
  const { height, width } = page.getSize();
  // 整体内容稍微往下移动，避免太贴近页面顶部
  let y = height - 80;
  const left = 50;
  const lineHeight = 20;
  const smallLine = 14;
  const contentBottom = 110;

  const fontForChar = (char: string, bold: boolean) => {
    const needsCustomFont = useCustomFont && /[^\x20-\x7E]/.test(char);
    if (needsCustomFont) return bold ? fontBold : font;
    return bold ? latinFontBold : latinFont;
  };

  const textRuns = (text: string, bold = false) => {
    const runs: Array<{ text: string; font: PDFFont }> = [];
    for (const char of text) {
      const runFont = fontForChar(char, bold);
      const previous = runs[runs.length - 1];
      if (previous?.font === runFont) previous.text += char;
      else runs.push({ text: char, font: runFont });
    }
    return runs;
  };

  const measureText = (text: string, size: number, bold = false) =>
    textRuns(text, bold).reduce(
      (width, run) => width + run.font.widthOfTextAtSize(run.text, size),
      0,
    );

  const drawText = (
    text: string,
    options: { x: number; y: number; size: number; bold?: boolean },
  ) => {
    let x = options.x;
    for (const run of textRuns(text, options.bold)) {
      page.drawText(run.text, {
        x,
        y: options.y,
        size: options.size,
        font: run.font,
        color: rgb(0, 0, 0),
      });
      x += run.font.widthOfTextAtSize(run.text, options.size);
    }
  };

  const addContinuationPage = () => {
    page = doc.addPage([612, 792]);
    y = height - 60;
    drawText(textForPdf(input.companyName), {
      x: left,
      y,
      size: 14,
      bold: true,
    });
    drawText("Invoice — Continued", {
      x: width - 170,
      y,
      size: 12,
      bold: true,
    });
    y -= 28;
  };

  const ensureSpace = (requiredHeight: number) => {
    if (y - requiredHeight < contentBottom) addContinuationPage();
  };

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    ensureSpace(lineHeight);
    const size = opts?.size ?? 12;
    drawText(text, { x: left, y, size, bold: opts?.bold });
    y -= lineHeight;
  };

  // 标题区：公司名（左上）+ Invoice（右上，与公司名同一基线）；其下为地址与电话
  draw(textForPdf(input.companyName), { bold: true, size: 20 });
  const invoiceTitle = "Invoice";
  const invoiceSize = 16;
  const invoiceWidth = measureText(invoiceTitle, invoiceSize, true);
  const companyBaselineY = y + lineHeight;
  drawText(invoiceTitle, {
    x: width - invoiceWidth - 50,
    y: companyBaselineY,
    size: invoiceSize,
    bold: true,
  });
  draw("25503 Industrial Blvd, Hayward, CA 94545", { size: 11 });
  draw("Tel: 4159679959", { size: 11 });
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
      ensureSpace(smallLine);
      drawText("• " + textForPdf(name), { x: left + 8, y, size: 11 });
      y -= smallLine;
    });
    y -= 10;
  }

  if (input.parts.length) {
    const drawPartsHeader = () => {
      draw("Parts", { bold: true, size: 13 });
      drawText("Name", { x: left, y, size: 11, bold: true });
      drawText("Qty", { x: left + 200, y, size: 11, bold: true });
      drawText("Unit Price", { x: left + 260, y, size: 11, bold: true });
      drawText("Line Total", { x: left + 360, y, size: 11, bold: true });
      y -= smallLine;
    };
    drawPartsHeader();
    input.parts.forEach((p) => {
      const nameLines = wrapText(textForPdf(p.name), 185, (value) => measureText(value, 11));
      const rowHeight = Math.max(smallLine, nameLines.length * smallLine);
      if (y - rowHeight < contentBottom) {
        addContinuationPage();
        drawPartsHeader();
      }
      nameLines.forEach((line, index) => {
        drawText(line, {
          x: left,
          y: y - index * smallLine,
          size: 11,
        });
      });
      drawText(String(p.qty), { x: left + 200, y, size: 11 });
      drawText(formatCents(p.unit_price_cents), { x: left + 260, y, size: 11 });
      drawText(formatCents(p.line_total_cents), { x: left + 360, y, size: 11 });
      y -= rowHeight;
    });
    y -= 10;
  }

  if (input.labor.length) {
    const drawLaborHeader = () => {
      draw("Labor", { bold: true, size: 13 });
      drawText("Name", { x: left, y, size: 11, bold: true });
      drawText("Hours", { x: left + 200, y, size: 11, bold: true });
      drawText("Rate", { x: left + 280, y, size: 11, bold: true });
      drawText("Line Total", { x: left + 360, y, size: 11, bold: true });
      y -= smallLine;
    };
    drawLaborHeader();
    input.labor.forEach((l) => {
      if (y - smallLine < contentBottom) {
        addContinuationPage();
        drawLaborHeader();
      }
      drawText(textForPdf(l.name).slice(0, 28), { x: left, y, size: 11 });
      drawText(String(l.hours), { x: left + 200, y, size: 11 });
      drawText(formatCents(l.rate_cents), { x: left + 280, y, size: 11 });
      drawText(formatCents(l.line_total_cents), { x: left + 360, y, size: 11 });
      y -= smallLine;
    });
    y -= 10;
  }

  // Keep totals together and reserve the bottom of the final page for signatures.
  if (y < 210) addContinuationPage();
  draw(`Labor Subtotal: ${formatCents(input.labor_subtotal_cents)}`);
  if (input.apply_cleaning !== false) {
    draw(`Cleaning Fee: ${formatCents(input.cleaning_fee_cents)}`);
  }
  if (input.apply_tax !== false) {
    draw(`Tax: ${formatCents(input.tax_cents)}`);
  }
  draw(`Grand Total: ${formatCents(input.grand_total_cents)}`, { bold: true });

  // 签名区域固定在页面下部，避免跟上面内容太接近
  y = 80;
  drawText("Customer Signature: _________________________________________", {
    x: left,
    y,
    size: 12,
  });
  y -= 24;
  drawText("Date: _________________________________________", {
    x: left,
    y,
    size: 12,
  });

  const pdfBytes = await doc.save();
  return { pdfBytes, usedCustomFont: useCustomFont };
}
