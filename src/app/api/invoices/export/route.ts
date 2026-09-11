import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { buildInvoiceExportBuffer } from "@/lib/invoice-export";

export const runtime = "nodejs";

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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
    where: { clerk_user_id: userId, issued_at: { gte: start, lte: end } },
    include: {
      case: {
        select: {
          bill_to_company: true,
          payment_method: true,
          plate: true,
          unit_number: true,
        },
      },
    },
    orderBy: { issued_at: "desc" },
  });

  const buffer = await buildInvoiceExportBuffer(invoices);
  return new Response(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="invoice-export-${parsed.data.start}-${parsed.data.end}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
