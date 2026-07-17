import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { generateCasePdf } from "@/lib/pdf";

/** PDF 中文字体：仅使用 NotoSerifSC-Medium.ttf */
const PDF_FONT_FILE = "NotoSerifSC-Medium.ttf";
let cachedFontBytes: Uint8Array | null = null;

async function getChineseFontBytes(): Promise<Uint8Array | undefined> {
  if (cachedFontBytes) return cachedFontBytes;
  try {
    const fontPath = join(process.cwd(), "public", "fonts", PDF_FONT_FILE);
    const buf = await readFile(fontPath);
    cachedFontBytes = new Uint8Array(buf);
    return cachedFontBytes;
  } catch {
    return undefined;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: { orderBy: { created_at: "asc" } },
      labor: { orderBy: { created_at: "asc" } },
    },
  });
  if (!c || c.clerk_user_id !== userId) {
    return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  }

  const settings = await prisma.setting.findUnique({ where: { id: "default" } });
  const companyName = settings?.company_name ?? "YaoYuan Inc.";

  const customFontBytes = await getChineseFontBytes();
  if (customFontBytes) {
    console.info("PDF: 中文字体已加载, 大小:", customFontBytes.length, "bytes");
  } else {
    console.warn("PDF: 未加载中文字体，中文将显示为 ???");
  }
  const statusTextEn = { SUBMITTED: "Submitted", IN_PROGRESS: "In Progress", CANCELED: "Canceled", COMPLETED: "Completed" }[c.status] ?? c.status;

  const baseInput = {
    companyName,
    date: new Date(),
    plate: c.plate,
    vin: c.vin,
    unit_number: c.unit_number,
    driver_name: c.customer_name,
    driver_phone: c.customer_phone,
    apply_cleaning: c.apply_cleaning,
    apply_tax: c.apply_tax,
    repairItems: c.repair_items.map((i) => i.name),
    parts: c.parts.map((p) => ({
      name: p.name,
      qty: p.qty,
      unit_price_cents: p.unit_price_cents,
      line_total_cents: p.line_total_cents,
    })),
    labor: c.labor.map((l) => ({
      name: l.name,
      hours: Number(l.hours),
      rate_cents: l.rate_cents,
      line_total_cents: l.line_total_cents,
    })),
    labor_subtotal_cents: c.labor_subtotal_cents,
    cleaning_fee_cents: c.cleaning_fee_cents,
    tax_cents: c.tax_cents,
    grand_total_cents: c.grand_total_cents,
  };

  let result: { pdfBytes: Uint8Array; usedCustomFont: boolean };
  try {
    result = await generateCasePdf({
      ...baseInput,
      status: statusTextEn,
      customFontBytes,
    });
  } catch (err) {
    console.warn("PDF 使用指定字体生成失败，改用系统字体:", err instanceof Error ? err.message : err);
    try {
      result = await generateCasePdf({
        ...baseInput,
        status: statusTextEn,
        customFontBytes: undefined,
      });
      result = { ...result, usedCustomFont: false };
    } catch (fallbackErr) {
      console.error("PDF generation failed:", fallbackErr);
      return apiError("PDF_GENERATION_FAILED", "PDF 生成失败，请稍后重试", 500);
    }
  }

  const buffer = Buffer.from(result.pdfBytes);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quote-${id.slice(0, 8)}.pdf"`,
      "X-PDF-Font-Used": result.usedCustomFont ? "true" : "false",
    },
  });
}
