import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

const schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().max(100).nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  default_sale_price_cents: z.number().int().min(0).optional(),
  reorder_level: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "维护信息格式不正确", 400, parsed.error.flatten());
  const existing = await prisma.inventoryItem.findFirst({ where: { id, clerk_user_id: userId } });
  if (!existing) return apiError("INVENTORY_ITEM_NOT_FOUND", "库存商品不存在", 404);
  const actor = await getAuditActor(userId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventoryItem.update({ where: { id }, data: parsed.data });
    await tx.auditLog.create({ data: auditData(actor, { action: "INVENTORY_UPDATED", entityType: "INVENTORY_ITEM", entityId: id, entityLabel: result.name, details: { changed_fields: Object.keys(parsed.data) } }) });
    return result;
  });
  return Response.json(updated);
}
