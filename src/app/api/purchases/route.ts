import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminReadOnlyResponse, isAdminScope, ownerWhere, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { generatePurchaseNumber } from "@/lib/purchase-number";
import { auditData, getAuditActor } from "@/lib/audit";

const createSchema = z.object({
  supplier: z.string().trim().min(1).max(200),
  purchase_date: z.string().datetime(),
  additional_cost_cents: z.number().int().min(0).default(0),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({
    inventory_item_id: z.string().uuid(),
    qty: z.number().int().min(1),
    unit_cost_cents: z.number().int().min(0),
  })).min(1),
});

export async function GET() {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const orders = await prisma.purchaseOrder.findMany({
    where: ownerWhere(userId),
    include: { lines: { include: { inventory_item: { select: { sku: true, name: true, unit: true } } } } },
    orderBy: [
      { created_at: "desc" },
      { id: "desc" },
    ],
    take: 200,
  });
  return Response.json({ orders });
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  if (isAdminScope(userId)) return adminReadOnlyResponse();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "采购单信息格式不正确", 400, parsed.error.flatten());
  const uniqueIds = [...new Set(parsed.data.lines.map((line) => line.inventory_item_id))];
  const items = await prisma.inventoryItem.findMany({ where: { id: { in: uniqueIds }, clerk_user_id: userId, is_active: true } });
  if (items.length !== uniqueIds.length) return apiError("INVENTORY_ITEM_NOT_FOUND", "采购明细包含无效库存商品", 400);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const actor = await getAuditActor(userId);
  const subtotal = parsed.data.lines.reduce((sum, line) => sum + line.qty * line.unit_cost_cents, 0);
  let purchaseNumber = generatePurchaseNumber();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (!(await prisma.purchaseOrder.findUnique({ where: { purchase_number: purchaseNumber }, select: { id: true } }))) break;
    purchaseNumber = generatePurchaseNumber();
  }
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({ data: {
      clerk_user_id: userId,
      purchase_number: purchaseNumber,
      supplier: parsed.data.supplier,
      purchase_date: new Date(parsed.data.purchase_date),
      subtotal_cents: subtotal,
      additional_cost_cents: parsed.data.additional_cost_cents,
      total_cents: subtotal + parsed.data.additional_cost_cents,
      notes: parsed.data.notes || null,
      lines: {
        create: parsed.data.lines.map((line) => ({
          inventory_item_id: line.inventory_item_id,
          name_snapshot: itemMap.get(line.inventory_item_id)!.name,
          qty: line.qty,
          unit_cost_cents: line.unit_cost_cents,
          line_total_cents: line.qty * line.unit_cost_cents,
        })),
      },
    },
    include: { lines: true },
    });
    await tx.auditLog.create({ data: auditData(actor, { action: "PURCHASE_CREATED", entityType: "PURCHASE_ORDER", entityId: created.id, entityLabel: created.purchase_number, details: { supplier: created.supplier, total_cents: created.total_cents } }) });
    return created;
  });
  return Response.json(order, { status: 201 });
}
