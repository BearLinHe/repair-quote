import type { Prisma } from "@prisma/client";

export function availableQuantity(onHand: number, reserved: number) {
  return onHand - reserved;
}

export function weightedAverageCost(
  currentQty: number,
  currentAverageCents: number,
  incomingQty: number,
  incomingUnitCostCents: number,
) {
  if (incomingQty <= 0) return currentAverageCents;
  const resultingQty = currentQty + incomingQty;
  if (resultingQty <= 0) return 0;
  return Math.round(
    (currentQty * currentAverageCents + incomingQty * incomingUnitCostCents) /
      resultingQty,
  );
}

async function lockItem(db: Prisma.TransactionClient, itemId: string) {
  await db.$queryRaw`SELECT id FROM "InventoryItem" WHERE id = ${itemId} FOR UPDATE`;
  return db.inventoryItem.findUnique({ where: { id: itemId } });
}

export async function reserveInventory(
  db: Prisma.TransactionClient,
  input: { itemId: string; qty: number; userId: string; casePartId: string; note?: string },
) {
  const item = await lockItem(db, input.itemId);
  if (!item || item.clerk_user_id !== input.userId || !item.is_active) {
    throw new Error("INVENTORY_ITEM_NOT_FOUND");
  }
  if (availableQuantity(item.on_hand_qty, item.reserved_qty) < input.qty) {
    throw new Error("INSUFFICIENT_INVENTORY");
  }
  await db.inventoryItem.update({
    where: { id: item.id },
    data: { reserved_qty: { increment: input.qty } },
  });
  await db.stockMovement.create({
    data: {
      clerk_user_id: input.userId,
      inventory_item_id: item.id,
      type: "CASE_RESERVE",
      reserved_change: input.qty,
      unit_cost_cents: item.avg_cost_cents,
      total_cost_cents: item.avg_cost_cents * input.qty,
      reference_type: "CASE_PART",
      reference_id: input.casePartId,
      note: input.note,
    },
  });
  return item;
}

export async function changeReservation(
  db: Prisma.TransactionClient,
  input: { itemId: string; delta: number; userId: string; casePartId: string },
) {
  if (input.delta === 0) return;
  const item = await lockItem(db, input.itemId);
  if (!item || item.clerk_user_id !== input.userId) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (input.delta > 0 && availableQuantity(item.on_hand_qty, item.reserved_qty) < input.delta) {
    throw new Error("INSUFFICIENT_INVENTORY");
  }
  if (item.reserved_qty + input.delta < 0) throw new Error("INVALID_RESERVATION");
  await db.inventoryItem.update({
    where: { id: item.id },
    data: { reserved_qty: { increment: input.delta } },
  });
  await db.stockMovement.create({
    data: {
      clerk_user_id: input.userId,
      inventory_item_id: item.id,
      type: input.delta > 0 ? "CASE_RESERVE" : "CASE_RELEASE",
      reserved_change: input.delta,
      unit_cost_cents: item.avg_cost_cents,
      total_cost_cents: item.avg_cost_cents * Math.abs(input.delta),
      reference_type: "CASE_PART",
      reference_id: input.casePartId,
    },
  });
}

export async function consumeReservation(
  db: Prisma.TransactionClient,
  input: { itemId: string; qty: number; userId: string; casePartId: string },
) {
  const item = await lockItem(db, input.itemId);
  if (!item || item.clerk_user_id !== input.userId) throw new Error("INVENTORY_ITEM_NOT_FOUND");
  if (item.on_hand_qty < input.qty || item.reserved_qty < input.qty) {
    throw new Error("INSUFFICIENT_INVENTORY");
  }
  await db.inventoryItem.update({
    where: { id: item.id },
    data: {
      on_hand_qty: { decrement: input.qty },
      reserved_qty: { decrement: input.qty },
    },
  });
  await db.stockMovement.create({
    data: {
      clerk_user_id: input.userId,
      inventory_item_id: item.id,
      type: "CASE_CONSUMPTION",
      qty_change: -input.qty,
      reserved_change: -input.qty,
      unit_cost_cents: item.avg_cost_cents,
      total_cost_cents: item.avg_cost_cents * input.qty,
      reference_type: "CASE_PART",
      reference_id: input.casePartId,
    },
  });
  return item.avg_cost_cents;
}
