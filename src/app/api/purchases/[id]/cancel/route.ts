import { prisma } from "@/lib/db";
import { canAccessOwner, isWriteForbiddenScope, requireWriteAuth, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireWriteAuth();
  if (!userId) return unauthorizedResponse();
  if (isWriteForbiddenScope(userId)) return writeForbiddenResponse();
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!order || !canAccessOwner(userId, order.clerk_user_id)) return apiError("PURCHASE_NOT_FOUND", "采购单不存在", 404);
  if (order.status !== "DRAFT") return apiError("PURCHASE_NOT_DRAFT", "只有草稿采购单可以取消", 409);
  const actor = await getAuditActor(userId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELED" } });
    await tx.auditLog.create({ data: auditData(actor, { action: "PURCHASE_CANCELED", entityType: "PURCHASE_ORDER", entityId: id, entityLabel: order.purchase_number }) });
    return result;
  });
  return Response.json(updated);
}
