import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessOwner, ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { clerk_user_id: true },
  });
  if (!c || !canAccessOwner(userId, c.clerk_user_id)) {
    return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  }

  const [repairItems, parts, labor] = await Promise.all([
    prisma.caseRepairItem.findMany({
      where: { case: ownerWhere(userId) },
      orderBy: { updated_at: "desc" },
      select: { name: true },
      take: 200,
    }),
    prisma.casePart.findMany({
      where: { case: ownerWhere(userId) },
      orderBy: { updated_at: "desc" },
      select: { name: true, unit_price_cents: true },
      take: 200,
    }),
    prisma.caseLabor.findMany({
      where: { case: ownerWhere(userId) },
      orderBy: { updated_at: "desc" },
      select: { name: true, rate_cents: true },
      take: 200,
    }),
  ]);

  const repairItemNames: string[] = [];
  const seenItems = new Set<string>();
  for (const r of repairItems) {
    if (!seenItems.has(r.name)) {
      seenItems.add(r.name);
      repairItemNames.push(r.name);
    }
  }
  const partByName = new Map<string, number>();
  for (const p of parts) {
    if (!partByName.has(p.name)) partByName.set(p.name, p.unit_price_cents);
  }
  const laborByName = new Map<string, number>();
  for (const l of labor) {
    if (!laborByName.has(l.name)) laborByName.set(l.name, l.rate_cents);
  }

  return Response.json({
    repair_item_names: repairItemNames,
    part_templates: [...partByName.entries()].map(([name, last_unit_price_cents]) => ({
      name,
      last_unit_price_cents,
    })),
    labor_templates: [...laborByName.entries()].map(([name, last_rate_cents]) => ({
      name,
      last_rate_cents,
    })),
  });
}
