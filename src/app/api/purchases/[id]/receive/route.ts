import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { weightedAverageCost } from "@/lib/inventory";
import { auditData, getAuditActor } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const actor = await getAuditActor(userId);
  try {
    const received = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const order = await tx.purchaseOrder.findFirst({
        where: { id, clerk_user_id: userId },
        include: { lines: true },
      });
      if (!order) throw new Error("NOT_FOUND");
      if (order.status !== "DRAFT") throw new Error("NOT_DRAFT");

      for (const line of order.lines) {
        await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${line.inventory_item_id} FOR UPDATE`;
        const item = await tx.inventoryItem.findFirst({ where: { id: line.inventory_item_id, clerk_user_id: userId } });
        if (!item) throw new Error("ITEM_NOT_FOUND");
        const nextAverage = weightedAverageCost(item.on_hand_qty, item.avg_cost_cents, line.qty, line.unit_cost_cents);
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { on_hand_qty: { increment: line.qty }, avg_cost_cents: nextAverage },
        });
        await tx.stockMovement.create({
          data: {
            clerk_user_id: userId,
            inventory_item_id: item.id,
            type: "PURCHASE_RECEIPT",
            qty_change: line.qty,
            unit_cost_cents: line.unit_cost_cents,
            total_cost_cents: line.line_total_cents,
            reference_type: "PURCHASE_ORDER",
            reference_id: order.id,
            note: order.purchase_number,
          },
        });
      }
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: "RECEIVED", received_at: new Date(), received_by: userId },
        include: { lines: true },
      });
      await tx.auditLog.create({ data: auditData(actor, { action: "PURCHASE_RECEIVED", entityType: "PURCHASE_ORDER", entityId: order.id, entityLabel: order.purchase_number, details: { item_count: order.lines.length, total_cents: order.total_cents } }) });
      return updated;
    });
    return Response.json(received);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return apiError("PURCHASE_NOT_FOUND", "采购单不存在", 404);
    if (error instanceof Error && error.message === "NOT_DRAFT") return apiError("PURCHASE_NOT_DRAFT", "只有草稿采购单可以确认入库", 409);
    if (error instanceof Error && error.message === "ITEM_NOT_FOUND") return apiError("INVENTORY_ITEM_NOT_FOUND", "采购商品不存在", 409);
    throw error;
  }
}
