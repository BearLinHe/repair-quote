import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";
import { apiError } from "@/lib/api-error";

async function getCaseAndCheck(id: string, userId: string) {
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: { orderBy: { created_at: "asc" } },
      labor: { orderBy: { created_at: "asc" } },
      status_logs: { orderBy: { changed_at: "desc" } },
    },
  });
  if (!c || c.clerk_user_id !== userId) return null;
  return c;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await getCaseAndCheck(id, userId);
  if (!c) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  const labor = c.labor.map((l) => ({
    id: l.id,
    case_id: l.case_id,
    name: l.name,
    hours: Number(l.hours),
    rate_cents: l.rate_cents,
    line_total_cents: l.line_total_cents,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }));
  return Response.json({
    ...c,
    labor,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { clerk_user_id: true, status: true },
  });
  if (!c || c.clerk_user_id !== userId) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  if (c.status === "CANCELED" || c.status === "COMPLETED") {
    return apiError("CASE_READ_ONLY", "该维修单已结束，不能继续修改", 409);
  }
  const body = await req.json().catch(() => ({}));
  const data: { apply_tax?: boolean; apply_cleaning?: boolean } = {};
  if ("apply_tax" in body) data.apply_tax = Boolean(body.apply_tax);
  if ("apply_cleaning" in body) data.apply_cleaning = Boolean(body.apply_cleaning);
  if (Object.keys(data).length === 0) {
    return apiError("VALIDATION_ERROR", "需要提供税费或清洁费设置", 400);
  }
  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data });
    await recalcTotals(id, tx);
  });
  const updated = await prisma.case.findUnique({ where: { id } });
  return Response.json(updated);
}
