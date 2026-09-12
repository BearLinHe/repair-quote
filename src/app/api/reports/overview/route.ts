import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const params = new URL(req.url).searchParams;
  const end = params.get("end") ? new Date(`${params.get("end")}T23:59:59.999`) : new Date();
  const start = params.get("start")
    ? new Date(`${params.get("start")}T00:00:00.000`)
    : new Date(end.getFullYear(), end.getMonth(), 1);

  const scope = ownerWhere(userId);
  const [purchase, invoice, laborHours, items] = await Promise.all([
    prisma.purchaseOrder.aggregate({
      where: { ...scope, status: "RECEIVED", received_at: { gte: start, lte: end } },
      _sum: { total_cents: true },
      _count: true,
    }),
    prisma.invoiceRecord.aggregate({
      where: { ...scope, issued_at: { gte: start, lte: end }, payment_status: { not: "VOID" } },
      _sum: {
        parts_revenue_cents: true,
        labor_revenue_cents: true,
        cleaning_fee_cents: true,
        tax_cents: true,
        grand_total_cents: true,
        parts_cost_cents: true,
      },
      _count: true,
    }),
    prisma.caseLabor.aggregate({
      where: {
        case: {
          ...scope,
          invoice: {
            issued_at: { gte: start, lte: end },
            payment_status: { not: "VOID" },
          },
        },
      },
      _sum: { hours: true },
    }),
    prisma.inventoryItem.findMany({ where: { ...scope, is_active: true }, select: { on_hand_qty: true, reserved_qty: true, avg_cost_cents: true, reorder_level: true } }),
  ]);
  const netRevenue = (invoice._sum.parts_revenue_cents ?? 0) + (invoice._sum.labor_revenue_cents ?? 0) + (invoice._sum.cleaning_fee_cents ?? 0);
  const partsCost = invoice._sum.parts_cost_cents ?? 0;
  return Response.json({
    start,
    end,
    purchase_spend_cents: purchase._sum.total_cents ?? 0,
    purchase_count: purchase._count,
    net_revenue_cents: netRevenue,
    parts_revenue_cents: invoice._sum.parts_revenue_cents ?? 0,
    labor_revenue_cents: invoice._sum.labor_revenue_cents ?? 0,
    misc_revenue_cents: invoice._sum.cleaning_fee_cents ?? 0,
    labor_hours: Number(laborHours._sum.hours ?? 0),
    tax_collected_cents: invoice._sum.tax_cents ?? 0,
    invoice_total_cents: invoice._sum.grand_total_cents ?? 0,
    invoice_count: invoice._count,
    parts_cost_cents: partsCost,
    gross_profit_cents: netRevenue - partsCost,
    cash_difference_cents: (invoice._sum.grand_total_cents ?? 0) - (purchase._sum.total_cents ?? 0),
    inventory_value_cents: items.reduce((sum, item) => sum + item.on_hand_qty * item.avg_cost_cents, 0),
    reserved_units: items.reduce((sum, item) => sum + item.reserved_qty, 0),
    low_stock_count: items.filter((item) => item.on_hand_qty - item.reserved_qty <= item.reorder_level).length,
  });
}
