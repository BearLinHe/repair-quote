import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";
import { inventoryImageSchema } from "@/lib/inventory-image";

const createSchema = z.object({
  sku: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1).max(20).default("个"),
  default_sale_price_cents: z.number().int().min(0).default(0),
  reorder_level: z.number().int().min(0).default(0),
  image_data_url: inventoryImageSchema,
});

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const query = new URL(req.url).searchParams.get("query")?.trim();
  const items = await prisma.inventoryItem.findMany({
    where: {
      clerk_user_id: userId,
      ...(query
        ? {
            OR: [
              { sku: { contains: query, mode: "insensitive" as const } },
              { name: { contains: query, mode: "insensitive" as const } },
              { category: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ is_active: "desc" }, { name: "asc" }],
  });
  return Response.json({
    items: items.map((item) => ({
      ...item,
      available_qty: item.on_hand_qty - item.reserved_qty,
      inventory_value_cents: item.on_hand_qty * item.avg_cost_cents,
      is_low_stock: item.on_hand_qty - item.reserved_qty <= item.reorder_level,
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "库存商品信息格式不正确", 400, parsed.error.flatten());
  const actor = await getAuditActor(userId);
  try {
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({ data: { clerk_user_id: userId, ...parsed.data, category: parsed.data.category || null } });
      await tx.auditLog.create({ data: auditData(actor, { action: "INVENTORY_ITEM_CREATED", entityType: "INVENTORY_ITEM", entityId: created.id, entityLabel: created.name, details: { sku: created.sku } }) });
      return created;
    });
    return Response.json(item, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return apiError("DUPLICATE_SKU", "该 SKU 已存在", 409);
    }
    throw error;
  }
}
