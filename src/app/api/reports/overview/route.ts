import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminScope, ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { financeInvoiceWhere, parseFinanceFilters } from "@/lib/finance-query";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const parsed = parseFinanceFilters(params);
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "筛选条件不正确", 400);
  const { start, end, account: requestedOwner } = parsed.data;
  const scope = isAdminScope(userId) && requestedOwner
    ? { clerk_user_id: requestedOwner }
    : ownerWhere(userId);
  const where = { ...financeInvoiceWhere(scope, parsed.data), payment_status: { not: "VOID" as const } };

  const [invoice, laborHours] = await Promise.all([
    prisma.invoiceRecord.aggregate({
      where,
      _sum: {
        parts_revenue_cents: true,
        labor_revenue_cents: true,
        cleaning_fee_cents: true,
        tax_cents: true,
        grand_total_cents: true,
      },
      _count: true,
    }),
    prisma.caseLabor.aggregate({
      where: { case: { invoice: { is: where } } },
      _sum: { hours: true },
    }),
  ]);

  const netRevenue = (invoice._sum.parts_revenue_cents ?? 0)
    + (invoice._sum.labor_revenue_cents ?? 0)
    + (invoice._sum.cleaning_fee_cents ?? 0);

  return Response.json({
    start,
    end,
    net_revenue_cents: netRevenue,
    parts_revenue_cents: invoice._sum.parts_revenue_cents ?? 0,
    labor_revenue_cents: invoice._sum.labor_revenue_cents ?? 0,
    misc_revenue_cents: invoice._sum.cleaning_fee_cents ?? 0,
    labor_hours: Number(laborHours._sum.hours ?? 0),
    tax_collected_cents: invoice._sum.tax_cents ?? 0,
    invoice_total_cents: invoice._sum.grand_total_cents ?? 0,
    invoice_count: invoice._count,
  });
}
