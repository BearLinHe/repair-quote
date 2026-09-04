import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const order = await prisma.purchaseOrder.findFirst({ where: { id, clerk_user_id: userId } });
  if (!order) return apiError("PURCHASE_NOT_FOUND", "采购单不存在", 404);
  if (order.status !== "DRAFT") return apiError("PURCHASE_NOT_DRAFT", "只有草稿采购单可以取消", 409);
  const actor = await getAuditActor(userId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELED" } });
    await tx.auditLog.create({ data: auditData(actor, { action: "PURCHASE_CANCELED", entityType: "PURCHASE_ORDER", entityId: id, entityLabel: order.purchase_number }) });
    return result;
  });
  return Response.json(updated);
}
