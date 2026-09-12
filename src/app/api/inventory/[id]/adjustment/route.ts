import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminReadOnlyResponse, isAdminScope, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

const schema = z.object({
  counted_qty: z.number().int().min(0),
  reason: z.string().trim().min(1).max(500),
  unit_cost_cents: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  if (isAdminScope(userId)) return adminReadOnlyResponse();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "盘点信息格式不正确", 400, parsed.error.flatten());
  const actor = await getAuditActor(userId);
  try {
    const item = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.inventoryItem.findFirst({ where: { id, clerk_user_id: userId } });
      if (!current) throw new Error("NOT_FOUND");
      if (parsed.data.counted_qty < current.reserved_qty) throw new Error("BELOW_RESERVED");
      const difference = parsed.data.counted_qty - current.on_hand_qty;
      const nextAverageCost =
        difference > 0 && parsed.data.unit_cost_cents !== undefined
          ? Math.round(
              (current.on_hand_qty * current.avg_cost_cents + difference * parsed.data.unit_cost_cents) /
                parsed.data.counted_qty,
            )
          : current.avg_cost_cents;
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: { on_hand_qty: parsed.data.counted_qty, avg_cost_cents: nextAverageCost },
      });
      if (difference !== 0) {
        await tx.stockMovement.create({
          data: {
            clerk_user_id: userId,
            inventory_item_id: id,
            type: "COUNT_ADJUSTMENT",
            qty_change: difference,
            unit_cost_cents: difference > 0 ? (parsed.data.unit_cost_cents ?? current.avg_cost_cents) : current.avg_cost_cents,
            total_cost_cents: Math.abs(difference) * (difference > 0 ? (parsed.data.unit_cost_cents ?? current.avg_cost_cents) : current.avg_cost_cents),
            reference_type: "STOCK_COUNT",
            note: parsed.data.reason,
          },
        });
        await tx.auditLog.create({ data: auditData(actor, { action: "INVENTORY_COUNTED", entityType: "INVENTORY_ITEM", entityId: id, entityLabel: current.name, details: { before_qty: current.on_hand_qty, counted_qty: parsed.data.counted_qty, difference, reason: parsed.data.reason } }) });
      }
      return updated;
    });
    return Response.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return apiError("INVENTORY_ITEM_NOT_FOUND", "库存商品不存在", 404);
    if (error instanceof Error && error.message === "BELOW_RESERVED") return apiError("BELOW_RESERVED", "盘点数量不能低于已预留数量", 409);
    throw error;
  }
}
