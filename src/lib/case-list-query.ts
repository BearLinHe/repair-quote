import type { Prisma } from "@prisma/client";

export function caseListWhere(scope: { clerk_user_id?: string }, query?: string): Prisma.CaseWhereInput {
  const keyword = query?.trim();
  if (!keyword) return { ...scope };
  const contains = { contains: keyword, mode: "insensitive" as const };
  return {
    ...scope,
    OR: [
      { plate: contains },
      { vin: contains },
      { unit_number: contains },
      { invoice_number: contains },
      { repair_items: { some: { name: contains } } },
    ],
  };
}

export const caseListSelect = {
  id: true,
  invoice_number: true,
  plate: true,
  vin: true,
  unit_number: true,
  status: true,
  grand_total_cents: true,
  created_at: true,
  repair_items: {
    select: { id: true, name: true },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  },
} satisfies Prisma.CaseSelect;
