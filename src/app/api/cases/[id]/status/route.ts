import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { Prisma, type CaseStatus } from "@prisma/client";
import { canTransitionCase } from "@/lib/case-rules";
import { apiError } from "@/lib/api-error";
import { changeReservation, consumeReservation } from "@/lib/inventory";
import { auditData, getAuditActor } from "@/lib/audit";

const bodySchema = z.object({
  to_status: z.enum(["SUBMITTED", "IN_PROGRESS", "CANCELED", "COMPLETED"]),
  note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { id: true, clerk_user_id: true, status: true },
  });
  if (!c || c.clerk_user_id !== userId) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "状态信息格式不正确", 400, parsed.error.flatten());
  const to_status = parsed.data.to_status as CaseStatus;
  if (!canTransitionCase(c.status, to_status)) {
    return apiError("INVALID_STATUS_TRANSITION", "当前状态不允许执行此操作", 409);
  }
  const actor = await getAuditActor(userId);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Case" WHERE id = ${id} FOR UPDATE`;
      const fullCase = await tx.case.findUnique({
        where: { id },
        include: { repair_items: true, parts: true, labor: true },
      });
      if (!fullCase || fullCase.status !== c.status) throw new Error("STATUS_CHANGED");

      if (to_status === "COMPLETED") {
        for (const part of fullCase.parts) {
          if (!part.inventory_item_id || !part.reservation_active) continue;
          const actualCost = await consumeReservation(tx, {
            itemId: part.inventory_item_id,
            qty: part.qty,
            userId,
            casePartId: part.id,
          });
          await tx.casePart.update({
            where: { id: part.id },
            data: {
              reservation_active: false,
              unit_cost_snapshot_cents: actualCost,
              cost_total_cents: actualCost * part.qty,
            },
          });
          part.unit_cost_snapshot_cents = actualCost;
          part.cost_total_cents = actualCost * part.qty;
          part.reservation_active = false;
        }
        const partsCost = fullCase.parts.reduce((sum, part) => sum + part.cost_total_cents, 0);
        await tx.invoiceRecord.create({
          data: {
            clerk_user_id: userId,
            case_id: fullCase.id,
            invoice_number: fullCase.invoice_number,
            parts_revenue_cents: fullCase.parts_subtotal_cents,
            labor_revenue_cents: fullCase.labor_subtotal_cents,
            cleaning_fee_cents: fullCase.cleaning_fee_cents,
            tax_cents: fullCase.tax_cents,
            grand_total_cents: fullCase.grand_total_cents,
            parts_cost_cents: partsCost,
            snapshot: JSON.parse(JSON.stringify({
              invoice_number: fullCase.invoice_number,
              plate: fullCase.plate,
              vin: fullCase.vin,
              unit_number: fullCase.unit_number,
              customer_name: fullCase.customer_name,
              repair_items: fullCase.repair_items,
              parts: fullCase.parts,
              labor: fullCase.labor.map((labor) => ({ ...labor, hours: Number(labor.hours) })),
              totals: {
                parts_subtotal_cents: fullCase.parts_subtotal_cents,
                labor_subtotal_cents: fullCase.labor_subtotal_cents,
                cleaning_fee_cents: fullCase.cleaning_fee_cents,
                tax_cents: fullCase.tax_cents,
                grand_total_cents: fullCase.grand_total_cents,
                parts_cost_cents: partsCost,
              },
            })),
          },
        });
      } else if (to_status === "CANCELED") {
        for (const part of fullCase.parts) {
          if (!part.inventory_item_id || !part.reservation_active) continue;
          await changeReservation(tx, {
            itemId: part.inventory_item_id,
            delta: -part.qty,
            userId,
            casePartId: part.id,
          });
          await tx.casePart.update({ where: { id: part.id }, data: { reservation_active: false } });
        }
      }

      await tx.case.update({
        where: { id },
        data: {
          status: to_status,
          ...(to_status === "COMPLETED" || to_status === "CANCELED"
            ? { draft_data: Prisma.DbNull, draft_updated_at: null }
            : {}),
        },
      });
      await tx.caseStatusLog.create({
      data: {
        case_id: id,
        from_status: c.status,
        to_status,
        changed_by: userId,
        note: parsed.data.note ?? undefined,
      },
      });
      await tx.auditLog.create({ data: auditData(actor, { action: "CASE_STATUS_CHANGED", entityType: "CASE", entityId: id, entityLabel: fullCase.invoice_number, details: { from_status: c.status, to_status, note: parsed.data.note ?? null } }) });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_INVENTORY") return apiError("INSUFFICIENT_INVENTORY", "库存不足，无法完成维修单", 409);
    if (error instanceof Error && error.message === "STATUS_CHANGED") return apiError("STATUS_CHANGED", "维修单状态已变化，请刷新后重试", 409);
    throw error;
  }

  const updated = await prisma.case.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  return Response.json(updated);
}
