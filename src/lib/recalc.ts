import type { Prisma } from "@prisma/client";

export type TotalsInput = {
  parts_subtotal_cents: number;
  labor_subtotal_cents: number;
  cleaning_rate_bps: number;
  cleaning_cap_cents: number;
  tax_rate_bps: number;
  apply_cleaning: boolean;
  apply_tax: boolean;
};

export function calculateTotals(input: TotalsInput) {
  const cleaning_fee_cents = input.apply_cleaning
    ? Math.min(
        Math.round(
          (input.parts_subtotal_cents + input.labor_subtotal_cents) *
            (input.cleaning_rate_bps / 10000),
        ),
        input.cleaning_cap_cents,
      )
    : 0;

  const subtotal = input.parts_subtotal_cents + input.labor_subtotal_cents + cleaning_fee_cents;
  const tax_cents = input.apply_tax
    ? Math.round(subtotal * (input.tax_rate_bps / 10000))
    : 0;

  return {
    cleaning_fee_cents,
    tax_cents,
    grand_total_cents: subtotal + tax_cents,
  };
}

/**
 * Recalculate case totals from parts, labor, and settings; write back to cases.
 * Call after any change to repair items/parts/labor (or when settings change).
 */
export async function recalcTotals(
  caseId: string,
  db: Prisma.TransactionClient,
): Promise<void> {
  // Serialize total-affecting changes for the same case before reading its lines.
  await db.$queryRaw`SELECT id FROM "Case" WHERE id = ${caseId} FOR UPDATE`;

  const [settings, parts, labor, c] = await Promise.all([
    db.setting.findUnique({ where: { id: "default" } }),
    db.casePart.findMany({ where: { case_id: caseId } }),
    db.caseLabor.findMany({ where: { case_id: caseId } }),
    db.case.findUnique({
      where: { id: caseId },
      select: { apply_tax: true, apply_cleaning: true },
    }),
  ]);

  const parts_subtotal_cents = parts.reduce((s, p) => s + p.line_total_cents, 0);
  const labor_subtotal_cents = labor.reduce((s, l) => s + l.line_total_cents, 0);

  const cleaning_rate_bps = settings?.cleaning_rate_bps ?? 1000;
  const cleaning_cap_cents = settings?.cleaning_cap_cents ?? 20000;
  const tax_rate_bps = settings?.tax_rate_bps ?? 1075;

  const apply_cleaning = c?.apply_cleaning ?? true;
  const apply_tax = c?.apply_tax ?? true;
  const { cleaning_fee_cents, tax_cents, grand_total_cents } = calculateTotals({
    parts_subtotal_cents,
    labor_subtotal_cents,
    cleaning_rate_bps,
    cleaning_cap_cents,
    tax_rate_bps,
    apply_cleaning,
    apply_tax,
  });

  await db.case.update({
    where: { id: caseId },
    data: {
      parts_subtotal_cents,
      labor_subtotal_cents,
      cleaning_fee_cents,
      apply_tax,
      tax_cents,
      grand_total_cents,
    },
  });
}
