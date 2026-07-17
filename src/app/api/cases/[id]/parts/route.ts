import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";
import { apiError } from "@/lib/api-error";
import { canEditCaseDetails } from "@/lib/case-rules";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { clerk_user_id: true, status: true } });
  return c && c.clerk_user_id === userId ? c.status : null;
}

function editAccessError(status: Awaited<ReturnType<typeof checkCase>>) {
  if (!status) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  if (!canEditCaseDetails(status)) return apiError("CASE_READ_ONLY", "维修单仅在进行中可以修改", 409);
  return null;
}

const createSchema = z.object({
  name: z.string().min(1),
  unit_price_cents: z.number().int().min(0),
  qty: z.number().int().min(1),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  qty: z.number().int().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const accessError = editAccessError(await checkCase(id, userId));
  if (accessError) return accessError;
  const body = await req.json();
  const parsed = createSchema.safeParse({
    ...body,
    unit_price_cents: body.unit_price_cents != null ? Number(body.unit_price_cents) : undefined,
    qty: body.qty != null ? Number(body.qty) : undefined,
  });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "配件信息格式不正确", 400, parsed.error.flatten());
  const { name, unit_price_cents, qty } = parsed.data;
  const line_total_cents = unit_price_cents * qty;
  const part = await prisma.$transaction(async (tx) => {
    const created = await tx.casePart.create({
      data: { case_id: id, name: name.trim(), unit_price_cents, qty, line_total_cents },
    });
    await recalcTotals(id, tx);
    return created;
  });
  return Response.json(part);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const accessError = editAccessError(await checkCase(id, userId));
  if (accessError) return accessError;
  const body = await req.json();
  const partId = body.id as string | undefined;
  if (!partId) return apiError("VALIDATION_ERROR", "缺少配件 ID", 400);
  const parsed = updateSchema.safeParse({
    ...body,
    unit_price_cents: body.unit_price_cents != null ? Number(body.unit_price_cents) : undefined,
    qty: body.qty != null ? Number(body.qty) : undefined,
  });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "配件信息格式不正确", 400, parsed.error.flatten());
  const existing = await prisma.casePart.findFirst({
    where: { id: partId, case_id: id },
  });
  if (!existing) return apiError("PART_NOT_FOUND", "配件不存在", 404);
  const name = parsed.data.name !== undefined ? parsed.data.name.trim() : existing.name;
  const unit_price_cents = parsed.data.unit_price_cents ?? existing.unit_price_cents;
  const qty = parsed.data.qty ?? existing.qty;
  const line_total_cents = unit_price_cents * qty;
  const part = await prisma.$transaction(async (tx) => {
    const updated = await tx.casePart.update({
      where: { id: partId },
      data: { name, unit_price_cents, qty, line_total_cents },
    });
    await recalcTotals(id, tx);
    return updated;
  });
  return Response.json(part);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const accessError = editAccessError(await checkCase(id, userId));
  if (accessError) return accessError;
  const { searchParams } = new URL(req.url);
  const partId = searchParams.get("id");
  if (!partId) return apiError("VALIDATION_ERROR", "缺少配件 ID", 400);
  const existing = await prisma.casePart.findFirst({
    where: { id: partId, case_id: id },
  });
  if (!existing) return apiError("PART_NOT_FOUND", "配件不存在", 404);
  await prisma.$transaction(async (tx) => {
    await tx.casePart.delete({ where: { id: partId } });
    await recalcTotals(id, tx);
  });
  return Response.json({ ok: true });
}
