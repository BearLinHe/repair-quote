import { NextRequest } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";
import { apiError } from "@/lib/api-error";
import { canEditCaseDetails } from "@/lib/case-rules";
import { auditData, getAuditActor } from "@/lib/audit";
import { syncCompletedInvoice } from "@/lib/invoice-record";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { clerk_user_id: true, status: true } });
  return c && c.clerk_user_id === userId ? c.status : null;
}

function editAccessError(status: Awaited<ReturnType<typeof checkCase>>) {
  if (!status) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  if (!canEditCaseDetails(status)) return apiError("CASE_READ_ONLY", "已取消的维修单不能修改", 409);
  return null;
}

const createSchema = z.object({
  name: z.string().min(1),
  hours: z.number().min(0),
  rate_cents: z.number().int().min(0),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  hours: z.number().min(0).optional(),
  rate_cents: z.number().int().min(0).optional(),
});

function laborLineTotal(hours: number, rate_cents: number): number {
  return Math.round(hours * rate_cents);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const caseStatus = await checkCase(id, userId);
  const accessError = editAccessError(caseStatus);
  if (accessError) return accessError;
  const body = await req.json();
  const parsed = createSchema.safeParse({
    ...body,
    hours: body.hours != null ? Number(body.hours) : undefined,
    rate_cents: body.rate_cents != null ? Number(body.rate_cents) : undefined,
  });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "人工信息格式不正确", 400, parsed.error.flatten());
  const { name, hours, rate_cents } = parsed.data;
  const line_total_cents = laborLineTotal(hours, rate_cents);
  const actor = await getAuditActor(userId);
  const labor = await prisma.$transaction(async (tx) => {
    const created = await tx.caseLabor.create({
      data: {
        case_id: id,
        name: name.trim(),
        hours: new Decimal(hours),
        rate_cents,
        line_total_cents,
      },
    });
    await recalcTotals(id, tx);
    if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_LABOR_ADDED", entityType: "CASE", entityId: id, entityLabel: created.name, details: { hours, rate_cents } }) });
    return created;
  });
  return Response.json({
    ...labor,
    hours: Number(labor.hours),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const caseStatus = await checkCase(id, userId);
  const accessError = editAccessError(caseStatus);
  if (accessError) return accessError;
  const body = await req.json();
  const laborId = body.id as string | undefined;
  if (!laborId) return apiError("VALIDATION_ERROR", "缺少人工记录 ID", 400);
  const parsed = updateSchema.safeParse({
    ...body,
    hours: body.hours != null ? Number(body.hours) : undefined,
    rate_cents: body.rate_cents != null ? Number(body.rate_cents) : undefined,
  });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "人工信息格式不正确", 400, parsed.error.flatten());
  const existing = await prisma.caseLabor.findFirst({
    where: { id: laborId, case_id: id },
  });
  if (!existing) return apiError("LABOR_NOT_FOUND", "人工记录不存在", 404);
  const name = parsed.data.name !== undefined ? parsed.data.name.trim() : existing.name;
  const hours = parsed.data.hours !== undefined ? parsed.data.hours : Number(existing.hours);
  const rate_cents = parsed.data.rate_cents ?? existing.rate_cents;
  const line_total_cents = laborLineTotal(hours, rate_cents);
  const actor = await getAuditActor(userId);
  const labor = await prisma.$transaction(async (tx) => {
    const updated = await tx.caseLabor.update({
      where: { id: laborId },
      data: {
        name,
        hours: new Decimal(hours),
        rate_cents,
        line_total_cents,
      },
    });
    await recalcTotals(id, tx);
    if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_LABOR_UPDATED", entityType: "CASE", entityId: id, entityLabel: updated.name, details: { hours, rate_cents } }) });
    return updated;
  });
  return Response.json({
    ...labor,
    hours: Number(labor.hours),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const caseStatus = await checkCase(id, userId);
  const accessError = editAccessError(caseStatus);
  if (accessError) return accessError;
  const { searchParams } = new URL(req.url);
  const laborId = searchParams.get("id");
  if (!laborId) return apiError("VALIDATION_ERROR", "缺少人工记录 ID", 400);
  const existing = await prisma.caseLabor.findFirst({
    where: { id: laborId, case_id: id },
  });
  if (!existing) return apiError("LABOR_NOT_FOUND", "人工记录不存在", 404);
  const actor = await getAuditActor(userId);
  await prisma.$transaction(async (tx) => {
    await tx.caseLabor.delete({ where: { id: laborId } });
    await recalcTotals(id, tx);
    if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_LABOR_DELETED", entityType: "CASE", entityId: id, entityLabel: existing.name, details: { hours: Number(existing.hours) } }) });
  });
  return Response.json({ ok: true });
}
