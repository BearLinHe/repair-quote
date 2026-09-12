import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminReadOnlyResponse, isAdminScope, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";
import { inventoryImageSchema } from "@/lib/inventory-image";

const newItemSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(20).default("个"),
  default_sale_price_cents: z.number().int().min(0).default(0),
  reorder_level: z.number().int().min(0).default(0),
  image_data_url: inventoryImageSchema,
});

const schema = z.object({
  inventory_item_id: z.string().uuid().optional(),
  new_item: newItemSchema.optional(),
  source_type: z.enum(["INITIAL_STOCK", "REPAIR_RETURN", "WAREHOUSE_TRANSFER", "GIFT_SAMPLE", "OTHER"]),
  qty: z.number().int().positive(),
  unit_cost_cents: z.number().int().min(0),
  reason: z.string().trim().min(1).max(500),
}).refine((value) => Boolean(value.inventory_item_id) !== Boolean(value.new_item), {
  message: "请选择已有零件或填写一个新零件",
});

const sourceLabels = {
  INITIAL_STOCK: "期初库存",
  REPAIR_RETURN: "维修退回",
  WAREHOUSE_TRANSFER: "仓库调入",
  GIFT_SAMPLE: "赠品/样品",
  OTHER: "其他来源",
} as const;

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  if (isAdminScope(userId)) return adminReadOnlyResponse();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "其他入库信息格式不正确", 400, parsed.error.flatten());
  const actor = await getAuditActor(userId);

  try {
    const item = await prisma.$transaction(async (tx) => {
      let inventoryItem;
      if (parsed.data.new_item) {
        inventoryItem = await tx.inventoryItem.create({
          data: {
            clerk_user_id: userId,
            ...parsed.data.new_item,
            category: parsed.data.new_item.category || null,
          },
        });
      } else {
        await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${parsed.data.inventory_item_id} FOR UPDATE`;
        inventoryItem = await tx.inventoryItem.findFirst({
          where: { id: parsed.data.inventory_item_id, clerk_user_id: userId, is_active: true },
        });
        if (!inventoryItem) throw new Error("NOT_FOUND");
      }

      const nextQty = inventoryItem.on_hand_qty + parsed.data.qty;
      const nextAverageCost = Math.round(
        (inventoryItem.on_hand_qty * inventoryItem.avg_cost_cents + parsed.data.qty * parsed.data.unit_cost_cents) / nextQty,
      );
      const updated = await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { on_hand_qty: nextQty, avg_cost_cents: nextAverageCost },
      });
      await tx.stockMovement.create({
        data: {
          clerk_user_id: userId,
          inventory_item_id: inventoryItem.id,
          type: "MANUAL_ADJUSTMENT",
          qty_change: parsed.data.qty,
          unit_cost_cents: parsed.data.unit_cost_cents,
          total_cost_cents: parsed.data.qty * parsed.data.unit_cost_cents,
          reference_type: parsed.data.source_type,
          note: `[${sourceLabels[parsed.data.source_type]}] ${parsed.data.reason}`,
        },
      });
      await tx.auditLog.create({ data: auditData(actor, { action: "INVENTORY_OTHER_INBOUND", entityType: "INVENTORY_ITEM", entityId: inventoryItem.id, entityLabel: inventoryItem.name, details: { qty: parsed.data.qty, source: parsed.data.source_type, reason: parsed.data.reason } }) });
      return updated;
    });
    return Response.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return apiError("INVENTORY_ITEM_NOT_FOUND", "库存商品不存在或已停用", 404);
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return apiError("DUPLICATE_SKU", "该 SKU 已存在，请选择已有零件", 409);
    throw error;
  }
}
