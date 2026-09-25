import type { Prisma } from "@prisma/client";
import { auditData, type AuditActor } from "./audit";
import { importKey, moneyCents, reviewedInvoiceSchema, validateReviewedInvoice, type ReviewedInvoice } from "./purchase-import";
import { generatePurchaseNumber } from "./purchase-number";

export class PurchaseImportError extends Error {}

// Called within one transaction; no stock is changed until the existing receive endpoint is used.
export async function saveReviewedPurchase(tx: Prisma.TransactionClient, id: string, owner: string, actor: AuditActor, value: ReviewedInvoice) {
  const input = reviewedInvoiceSchema.parse(value);
  const issues = validateReviewedInvoice(input);
  if (issues.length) throw new PurchaseImportError(issues.join("；"));
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`purchase-import:${owner}`}))::text`;
  await tx.$queryRaw`SELECT id FROM "PurchaseImport" WHERE id = ${id} FOR UPDATE`;
  const source = await tx.purchaseImport.findUnique({ where: { id } });
  if (!source || source.clerk_user_id !== owner) throw new PurchaseImportError("识别记录不存在");
  if (source.purchase_order_id) return tx.purchaseOrder.findUniqueOrThrow({ where: { id: source.purchase_order_id } });
  if (source.status !== "READY") throw new PurchaseImportError("识别尚未完成，请刷新后重试");
  const supplierKey = importKey(input.supplier);
  const invoiceKey = importKey(input.invoice_number);
  const duplicate = await tx.purchaseOrder.findUnique({ where: {
    clerk_user_id_supplier_key_supplier_invoice_key: { clerk_user_id: owner, supplier_key: supplierKey, supplier_invoice_key: invoiceKey },
  } });
  if (duplicate) throw new PurchaseImportError(`这张供应商单据已经建单：${duplicate.purchase_number}。请查看采购记录，不要重复入库。`);
  const stockLines: Array<{ inventory_item_id: string; name_snapshot: string; qty: number; unit_cost_cents: number; line_total_cents: number }> = [];
  const confirmedMappings = new Map<string, string>();
  for (const line of input.lines.filter((item) => item.kind === "PART" && item.qty > 0)) {
    let item;
    if (line.inventory_item_id) {
      item = await tx.inventoryItem.findFirst({ where: { id: line.inventory_item_id, clerk_user_id: owner, is_active: true } });
      if (!item) throw new PurchaseImportError("选择的库存零件已停用或不属于当前账号，请重新选择");
    } else {
      item = await tx.inventoryItem.findFirst({ where: { clerk_user_id: owner, sku: { equals: line.new_sku, mode: "insensitive" } } });
      if (item) {
        // Repeated new-SKU lines in this same document can reuse the newly created item only.
        if (!stockLines.some((saved) => saved.inventory_item_id === item!.id) || item.name !== line.description || item.unit !== line.unit || !item.is_active) {
          throw new PurchaseImportError(`SKU ${line.new_sku} 已存在，请选择已有零件`);
        }
      } else {
        item = await tx.inventoryItem.create({ data: { clerk_user_id: owner, sku: line.new_sku, name: line.description, unit: line.unit } });
        await tx.auditLog.create({ data: auditData(actor, { action: "INVENTORY_ITEM_CREATED", entityType: "INVENTORY_ITEM", entityId: item.id, entityLabel: item.name, details: { sku: item.sku, purchase_import_id: id } }) });
      }
    }
    const unitCost = moneyCents(line.unit_price)!;
    stockLines.push({ inventory_item_id: item.id, name_snapshot: item.name, qty: line.qty, unit_cost_cents: unitCost, line_total_cents: line.qty * unitCost });
    if (line.item_number) {
      const partKey = importKey(line.item_number);
      if (confirmedMappings.has(partKey) && confirmedMappings.get(partKey) !== item.id) throw new PurchaseImportError("同一个供应商编号对应了不同 SKU，请核对");
      confirmedMappings.set(partKey, item.id);
    }
  }
  for (const [partKey, itemId] of confirmedMappings) {
    await tx.supplierPartMapping.upsert({
      where: { clerk_user_id_supplier_key_item_number_key: { clerk_user_id: owner, supplier_key: supplierKey, item_number_key: partKey } },
      create: { clerk_user_id: owner, supplier_key: supplierKey, item_number_key: partKey, inventory_item_id: itemId },
      update: { inventory_item_id: itemId },
    });
  }
  const subtotal = stockLines.reduce((sum, line) => sum + line.line_total_cents, 0);
  const total = moneyCents(input.total)!;
  const order = await tx.purchaseOrder.create({ data: {
    clerk_user_id: owner, supplier: input.supplier, supplier_invoice_number: input.invoice_number,
    supplier_key: supplierKey, supplier_invoice_key: invoiceKey, purchase_number: generatePurchaseNumber(),
    purchase_date: new Date(`${input.invoice_date}T12:00:00Z`),
    subtotal_cents: subtotal, additional_cost_cents: total - subtotal, total_cents: total,
    notes: input.notes || null, lines: { create: stockLines },
  } });
  await tx.purchaseImport.update({ where: { id }, data: { status: "SAVED", reviewed: input, purchase_order_id: order.id } });
  await tx.auditLog.create({ data: auditData(actor, { action: "PURCHASE_CREATED", entityType: "PURCHASE_ORDER", entityId: order.id, entityLabel: order.purchase_number, details: {
    source: "AI_REVIEWED", purchase_import_id: id, supplier: input.supplier, supplier_invoice_number: input.invoice_number,
    total_cents: total, parts_cents: subtotal, charges_cents: total - subtotal, stock_changed: false,
  } }) });
  return order;
}
