import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { generateCasePdf } from "@/lib/pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: true,
      labor: true,
    },
  });
  if (!c || c.clerk_user_id !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.setting.findFirst({ orderBy: { updated_at: "desc" } });
  const companyName = settings?.company_name ?? "YaoYuan Inc.";

  const pdfBytes = await generateCasePdf({
    companyName,
    date: new Date(),
    plate: c.plate,
    vin: c.vin,
    unit_number: c.unit_number,
    driver_name: c.customer_name,
    driver_phone: c.customer_phone,
    status: { SUBMITTED: "Submitted", IN_PROGRESS: "In Progress", CANCELED: "Canceled", COMPLETED: "Completed" }[c.status] ?? c.status,
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
  });

  const buffer = Buffer.from(pdfBytes);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="quote-${id.slice(0, 8)}.pdf"`,
    },
  });
}
