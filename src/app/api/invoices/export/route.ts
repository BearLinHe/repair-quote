import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminScope, ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { buildInvoiceExportBuffer } from "@/lib/invoice-export";
import { invoiceExportInputError, selectedInvoiceExportSchema } from "@/lib/invoice-export-input";
import { financeInvoiceWhere, parseFinanceFilters } from "@/lib/finance-query";

export const runtime = "nodejs";

const invoiceInclude = {
  case: {
    select: {
      bill_to_company: true,
      payment_method: true,
      plate: true,
      unit_number: true,
      parts: { select: { name: true, qty: true }, orderBy: { created_at: "asc" } },
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
  if (!params.get("start") || !params.get("end")) return apiError("VALIDATION_ERROR", "请选择有效的导出日期范围", 400);
  const parsed = parseFinanceFilters(params);
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "筛选条件不正确", 400);
  const scope = isAdminScope(userId) && parsed.data.account ? { clerk_user_id: parsed.data.account } : ownerWhere(userId);

  const invoices = await prisma.invoiceRecord.findMany({
    where: financeInvoiceWhere(scope, parsed.data),
    include: invoiceInclude,
    orderBy: { issued_at: "desc" },
  });

  return exportResponse(invoices, `invoice-export-${parsed.data.start}-${parsed.data.end}.xlsx`);
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const parsed = selectedInvoiceExportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", invoiceExportInputError(parsed.error), 400);

  const params = new URL(req.url).searchParams;
  const filters = params.size ? parseFinanceFilters(params) : null;
  if (filters && !filters.success) return apiError("VALIDATION_ERROR", filters.error.issues[0]?.message ?? "筛选条件不正确", 400);
  const scope = filters?.success && isAdminScope(userId) && filters.data.account ? { clerk_user_id: filters.data.account } : ownerWhere(userId);

  const invoices = await prisma.invoiceRecord.findMany({
    where: { ...(filters?.success ? financeInvoiceWhere(scope, filters.data) : scope), id: { in: parsed.data.ids } },
    include: invoiceInclude,
    orderBy: { issued_at: "desc" },
  });
  if (invoices.length !== parsed.data.ids.length) {
    return apiError("INVOICE_NOT_FOUND", filters ? "部分 Invoice 已不符合筛选条件、不存在或无权导出，请刷新后重新选择" : "部分 Invoice 不存在或无权导出", 404);
  }

  const date = new Date().toISOString().slice(0, 10);
  return exportResponse(invoices, `invoice-export-selected-${date}.xlsx`);
}
