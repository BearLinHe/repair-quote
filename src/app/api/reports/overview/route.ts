import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminScope, ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const end = params.get("end") ? new Date(`${params.get("end")}T23:59:59.999`) : new Date();
  const start = params.get("start")
    ? new Date(`${params.get("start")}T00:00:00.000`)
    : new Date(end.getFullYear(), end.getMonth(), 1);
  const billTo = params.get("bill_to")?.trim();
  const requestedOwner = params.get("account")?.trim();
  const scope = isAdminScope(userId) && requestedOwner
    ? { clerk_user_id: requestedOwner }
    : ownerWhere(userId);
  const invoiceCaseFilter = billTo
    ? { case: { bill_to_company: { contains: billTo, mode: "insensitive" as const } } }
    : {};
  const laborCaseFilter = billTo
    ? { bill_to_company: { contains: billTo, mode: "insensitive" as const } }
    : {};

  const [invoice, laborHours] = await Promise.all([
    prisma.invoiceRecord.aggregate({
      where: {
        ...scope,
        ...invoiceCaseFilter,
        issued_at: { gte: start, lte: end },
        payment_status: { not: "VOID" },
      },
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
      where: {
        case: {
          ...scope,
          ...laborCaseFilter,
          invoice: {
            issued_at: { gte: start, lte: end },
            payment_status: { not: "VOID" },
          },
        },
      },
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
