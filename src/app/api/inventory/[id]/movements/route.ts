import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const item = await prisma.inventoryItem.findFirst({ where: { id, clerk_user_id: userId } });
  if (!item) return apiError("INVENTORY_ITEM_NOT_FOUND", "库存商品不存在", 404);
  const movements = await prisma.stockMovement.findMany({
    where: { inventory_item_id: id, clerk_user_id: userId },
    orderBy: { created_at: "desc" },
    take: 100,
  });
  return Response.json({ item, movements });
}
