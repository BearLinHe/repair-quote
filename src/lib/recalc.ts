import { prisma } from "@/lib/db";

/**
 * Recalculate case totals from parts, labor, and settings; write back to cases.
 * Call after any change to repair items/parts/labor (or when settings change).
 */
export async function recalcTotals(caseId: string): Promise<void> {
  const [settings, parts, labor] = await Promise.all([
    prisma.setting.findFirst({ orderBy: { updated_at: "desc" } }),
    prisma.casePart.findMany({ where: { case_id: caseId } }),
    prisma.caseLabor.findMany({ where: { case_id: caseId } }),
  ]);

  const parts_subtotal_cents = parts.reduce((s, p) => s + p.line_total_cents, 0);
  const labor_subtotal_cents = labor.reduce((s, l) => s + l.line_total_cents, 0);

  const cleaning_rate_bps = settings?.cleaning_rate_bps ?? 1000;
  const cleaning_cap_cents = settings?.cleaning_cap_cents ?? 20000;
  const tax_rate_bps = settings?.tax_rate_bps ?? 1075;

  const cleaning_fee_cents = Math.min(
    Math.round((parts_subtotal_cents + labor_subtotal_cents) * (cleaning_rate_bps / 10000)),
    cleaning_cap_cents
  );

  const subtotal = parts_subtotal_cents + labor_subtotal_cents + cleaning_fee_cents;
  const tax_cents = Math.round(subtotal * (tax_rate_bps / 10000));
  const grand_total_cents = subtotal + tax_cents;

  await prisma.case.update({
    where: { id: caseId },
    data: {
      parts_subtotal_cents,
      labor_subtotal_cents,
      cleaning_fee_cents,
      tax_cents,
      grand_total_cents,
    },
  });
}
