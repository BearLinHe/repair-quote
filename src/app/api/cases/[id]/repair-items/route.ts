import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { canEditCaseDetails } from "@/lib/case-rules";
import { auditData, getAuditActor } from "@/lib/audit";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { clerk_user_id: true, status: true } });
  return c && c.clerk_user_id === userId ? c.status : null;
}

function editAccessError(status: Awaited<ReturnType<typeof checkCase>>) {
  if (!status) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  if (!canEditCaseDetails(status)) return apiError("CASE_READ_ONLY", "维修单仅在进行中可以修改", 409);
  return null;
}

const createSchema = z.object({ name: z.string().min(1), sort_order: z.number().int().optional() });
const updateSchema = z.object({ name: z.string().min(1).optional(), sort_order: z.number().int().optional() });

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "维修项目信息格式不正确", 400, parsed.error.flatten());
  const maxOrder = await prisma.caseRepairItem.findFirst({
    where: { case_id: id },
    orderBy: { sort_order: "desc" },
    select: { sort_order: true },
  });
  const actor = await getAuditActor(userId);
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.caseRepairItem.create({ data: {
      case_id: id,
      name: parsed.data.name.trim(),
      sort_order: parsed.data.sort_order ?? (maxOrder?.sort_order ?? -1) + 1,
    } });
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_REPAIR_ITEM_ADDED", entityType: "CASE", entityId: id, entityLabel: created.name }) });
    return created;
  });
  return Response.json(item);
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
  const itemId = body.id as string | undefined;
  if (!itemId) return apiError("VALIDATION_ERROR", "缺少维修项目 ID", 400);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "维修项目信息格式不正确", 400, parsed.error.flatten());
  const existing = await prisma.caseRepairItem.findFirst({
    where: { id: itemId, case_id: id },
  });
  if (!existing) return apiError("REPAIR_ITEM_NOT_FOUND", "维修项目不存在", 404);
  const actor = await getAuditActor(userId);
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.caseRepairItem.update({ where: { id: itemId }, data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
      ...(parsed.data.sort_order !== undefined && { sort_order: parsed.data.sort_order }),
    } });
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_REPAIR_ITEM_UPDATED", entityType: "CASE", entityId: id, entityLabel: updated.name }) });
    return updated;
  });
  return Response.json(item);
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
  const itemId = searchParams.get("id");
  if (!itemId) return apiError("VALIDATION_ERROR", "缺少维修项目 ID", 400);
  const existing = await prisma.caseRepairItem.findFirst({
    where: { id: itemId, case_id: id },
  });
  if (!existing) return apiError("REPAIR_ITEM_NOT_FOUND", "维修项目不存在", 404);
  const actor = await getAuditActor(userId);
  await prisma.$transaction(async (tx) => {
    await tx.caseRepairItem.delete({ where: { id: itemId } });
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_REPAIR_ITEM_DELETED", entityType: "CASE", entityId: id, entityLabel: existing.name }) });
  });
  return Response.json({ ok: true });
}
