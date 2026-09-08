import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";
import { apiError } from "@/lib/api-error";
import { canEditCaseDetails } from "@/lib/case-rules";
import { changeCompletedConsumption, changeReservation, reserveInventory } from "@/lib/inventory";
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
  unit_price_cents: z.number().int().min(0).optional(),
  qty: z.number().int().min(1),
  inventory_item_id: z.string().uuid(),
});
const updateSchema = z.object({
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
  const caseStatus = await checkCase(id, userId);
  const accessError = editAccessError(caseStatus);
  if (accessError) return accessError;
  const body = await req.json();
  const parsed = createSchema.safeParse({
    ...body,
    unit_price_cents: body.unit_price_cents != null ? Number(body.unit_price_cents) : undefined,
    qty: body.qty != null ? Number(body.qty) : undefined,
  });
  if (!parsed.success) return apiError("VALIDATION_ERROR", "配件信息格式不正确", 400, parsed.error.flatten());
  const { unit_price_cents, qty, inventory_item_id } = parsed.data;
  const actor = await getAuditActor(userId);
  try {
    const part = await prisma.$transaction(async (tx) => {
      const inventoryItem = await tx.inventoryItem.findFirst({ where: { id: inventory_item_id, clerk_user_id: userId, is_active: true } });
      if (!inventoryItem) throw new Error("INVENTORY_ITEM_NOT_FOUND");
      const resolvedUnitPrice = unit_price_cents ?? inventoryItem.default_sale_price_cents;
      const created = await tx.casePart.create({
        data: {
          case_id: id,
          name: inventoryItem.name,
          unit_price_cents: resolvedUnitPrice,
          qty,
          line_total_cents: resolvedUnitPrice * qty,
          inventory_item_id: inventoryItem.id,
          unit_cost_snapshot_cents: inventoryItem.avg_cost_cents,
          cost_total_cents: inventoryItem.avg_cost_cents * qty,
          reservation_active: caseStatus === "IN_PROGRESS",
        },
      });
      if (caseStatus === "COMPLETED") {
        await changeCompletedConsumption(tx, { itemId: inventoryItem.id, delta: qty, userId, casePartId: created.id, unitCostCents: inventoryItem.avg_cost_cents });
      } else {
        await reserveInventory(tx, { itemId: inventoryItem.id, qty, userId, casePartId: created.id, note: `维修单 ${id}` });
      }
      await recalcTotals(id, tx);
      if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
      await tx.auditLog.create({ data: auditData(actor, { action: "CASE_PART_ADDED", entityType: "CASE", entityId: id, entityLabel: inventoryItem.name, details: { qty, unit_price_cents: resolvedUnitPrice } }) });
      return created;
    });
    return Response.json(part);
  } catch (error) {
    if (error instanceof Error && error.message === "INVENTORY_ITEM_NOT_FOUND") return apiError("INVENTORY_ITEM_NOT_FOUND", "库存商品不存在或已停用", 404);
    if (error instanceof Error && error.message === "INSUFFICIENT_INVENTORY") return apiError("INSUFFICIENT_INVENTORY", "可用库存不足", 409);
    throw error;
  }
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
  const unit_price_cents = parsed.data.unit_price_cents ?? existing.unit_price_cents;
  const qty = parsed.data.qty ?? existing.qty;
  const line_total_cents = unit_price_cents * qty;
  const actor = await getAuditActor(userId);
  try {
    const part = await prisma.$transaction(async (tx) => {
      if (existing.inventory_item_id && existing.reservation_active && qty !== existing.qty) {
        await changeReservation(tx, {
          itemId: existing.inventory_item_id,
          delta: qty - existing.qty,
          userId,
          casePartId: existing.id,
        });
      }
      if (caseStatus === "COMPLETED" && existing.inventory_item_id && qty !== existing.qty) {
        await changeCompletedConsumption(tx, { itemId: existing.inventory_item_id, delta: qty - existing.qty, userId, casePartId: existing.id, unitCostCents: existing.unit_cost_snapshot_cents });
      }
      const updated = await tx.casePart.update({
        where: { id: partId },
        data: {
          unit_price_cents,
          qty,
          line_total_cents,
          cost_total_cents: existing.unit_cost_snapshot_cents * qty,
        },
      });
      await recalcTotals(id, tx);
      if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
      await tx.auditLog.create({ data: auditData(actor, { action: "CASE_PART_UPDATED", entityType: "CASE", entityId: id, entityLabel: existing.name, details: { qty, unit_price_cents } }) });
      return updated;
    });
    return Response.json(part);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_INVENTORY") return apiError("INSUFFICIENT_INVENTORY", "可用库存不足", 409);
    throw error;
  }
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
  const partId = searchParams.get("id");
  if (!partId) return apiError("VALIDATION_ERROR", "缺少配件 ID", 400);
  const existing = await prisma.casePart.findFirst({
    where: { id: partId, case_id: id },
  });
  if (!existing) return apiError("PART_NOT_FOUND", "配件不存在", 404);
  const actor = await getAuditActor(userId);
  await prisma.$transaction(async (tx) => {
    if (existing.inventory_item_id && existing.reservation_active) {
      await changeReservation(tx, {
        itemId: existing.inventory_item_id,
        delta: -existing.qty,
        userId,
        casePartId: existing.id,
      });
    }
    if (caseStatus === "COMPLETED" && existing.inventory_item_id) {
      await changeCompletedConsumption(tx, { itemId: existing.inventory_item_id, delta: -existing.qty, userId, casePartId: existing.id, unitCostCents: existing.unit_cost_snapshot_cents });
    }
    await tx.casePart.delete({ where: { id: partId } });
    await recalcTotals(id, tx);
    if (caseStatus === "COMPLETED") await syncCompletedInvoice(id, tx);
    await tx.auditLog.create({ data: auditData(actor, { action: "CASE_PART_DELETED", entityType: "CASE", entityId: id, entityLabel: existing.name, details: { qty: existing.qty } }) });
  });
  return Response.json({ ok: true });
}
