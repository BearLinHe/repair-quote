import { Prisma } from "@prisma/client";

export async function syncCompletedInvoice(caseId: string, db: Prisma.TransactionClient) {
  const repairCase = await db.case.findUnique({
    where: { id: caseId },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: { orderBy: { created_at: "asc" } },
      labor: { orderBy: { created_at: "asc" } },
    },
  });
  if (!repairCase || repairCase.status !== "COMPLETED") return;

  const partsCost = repairCase.parts.reduce((sum, part) => sum + part.cost_total_cents, 0);
  const snapshot = JSON.parse(JSON.stringify({
    invoice_number: repairCase.invoice_number,
    plate: repairCase.plate,
    vin: repairCase.vin,
    unit_number: repairCase.unit_number,
    customer_name: repairCase.customer_name,
    bill_to_company: repairCase.bill_to_company,
    bill_to_address: repairCase.bill_to_address,
    bill_to_contact: repairCase.bill_to_contact,
    payment_method: repairCase.payment_method,
    repair_items: repairCase.repair_items,
    parts: repairCase.parts,
    labor: repairCase.labor.map((labor) => ({ ...labor, hours: Number(labor.hours) })),
    totals: {
      parts_subtotal_cents: repairCase.parts_subtotal_cents,
      labor_subtotal_cents: repairCase.labor_subtotal_cents,
      cleaning_fee_cents: repairCase.cleaning_fee_cents,
      tax_cents: repairCase.tax_cents,
      grand_total_cents: repairCase.grand_total_cents,
      parts_cost_cents: partsCost,
    },
  })) as Prisma.InputJsonValue;

  await db.invoiceRecord.upsert({
    where: { case_id: caseId },
    create: {
      clerk_user_id: repairCase.clerk_user_id,
      case_id: caseId,
      invoice_number: repairCase.invoice_number,
      parts_revenue_cents: repairCase.parts_subtotal_cents,
      labor_revenue_cents: repairCase.labor_subtotal_cents,
      cleaning_fee_cents: repairCase.cleaning_fee_cents,
      tax_cents: repairCase.tax_cents,
      grand_total_cents: repairCase.grand_total_cents,
      parts_cost_cents: partsCost,
      snapshot,
    },
    update: {
      parts_revenue_cents: repairCase.parts_subtotal_cents,
      labor_revenue_cents: repairCase.labor_subtotal_cents,
      cleaning_fee_cents: repairCase.cleaning_fee_cents,
      tax_cents: repairCase.tax_cents,
      grand_total_cents: repairCase.grand_total_cents,
      parts_cost_cents: partsCost,
      snapshot,
    },
  });
}
