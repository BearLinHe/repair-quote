import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { buildInvoiceExportBuffer } from "@/lib/invoice-export";

export const runtime = "nodejs";

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const selectedSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(300),
});

const invoiceInclude = {
  case: {
    select: {
      bill_to_company: true,
      payment_method: true,
      plate: true,
      unit_number: true,
    },
  },
} as const;

async function exportResponse(invoices: Parameters<typeof buildInvoiceExportBuffer>[0], filename: string) {
  const buffer = await buildInvoiceExportBuffer(invoices);
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ start: params.get("start"), end: params.get("end") });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "请选择有效的导出日期范围", 400);

  const start = new Date(`${parsed.data.start}T00:00:00.000`);
  const end = new Date(`${parsed.data.end}T23:59:59.999`);
  if (start > end) return apiError("VALIDATION_ERROR", "开始日期不能晚于结束日期", 400);

  const invoices = await prisma.invoiceRecord.findMany({
    where: { ...ownerWhere(userId), issued_at: { gte: start, lte: end } },
    include: invoiceInclude,
    orderBy: { issued_at: "desc" },
  });

  return exportResponse(invoices, `invoice-export-${parsed.data.start}-${parsed.data.end}.xlsx`);
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const parsed = selectedSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "请选择需要导出的 Invoice", 400);

  const invoices = await prisma.invoiceRecord.findMany({
    where: { ...ownerWhere(userId), id: { in: parsed.data.ids } },
    include: invoiceInclude,
    orderBy: { issued_at: "desc" },
  });
  if (invoices.length !== parsed.data.ids.length) {
    return apiError("INVOICE_NOT_FOUND", "部分 Invoice 不存在或无权导出", 404);
  }

  const date = new Date().toISOString().slice(0, 10);
  return exportResponse(invoices, `invoice-export-selected-${date}.xlsx`);
}
