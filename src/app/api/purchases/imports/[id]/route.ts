import { prisma } from "@/lib/db";
import { getCurrentAccount, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { boundedJson } from "@/lib/purchase-import-server";
import { extractedInvoiceSchema, importKey, reviewedInvoiceSchema, suggestInventoryItem } from "@/lib/purchase-import";
import { PurchaseImportError, saveReviewedPurchase } from "@/lib/purchase-import-save";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  const { id } = await context.params;
  const source = await prisma.purchaseImport.findFirst({ where: { id, ...(account.role === "ADMIN" ? {} : { clerk_user_id: account.dataOwnerId ?? "" }) } });
  if (!source) return apiError("NOT_FOUND", "识别记录不存在", 404);
  const items = await prisma.inventoryItem.findMany({ where: { clerk_user_id: source.clerk_user_id, is_active: true }, select: { id: true, name: true, sku: true, unit: true }, orderBy: { name: "asc" } });
  const extracted = extractedInvoiceSchema.safeParse(source.extracted);
  const supplierKey = importKey(extracted.success ? extracted.data.supplier ?? "" : "");
  const mappings = await prisma.supplierPartMapping.findMany({ where: { clerk_user_id: source.clerk_user_id, supplier_key: supplierKey } });
  const suggestions = extracted.success ? extracted.data.lines.map((line) => suggestInventoryItem(line.item_number ?? "", items, mappings.find((mapping) => mapping.item_number_key === importKey(line.item_number ?? ""))?.inventory_item_id)) : [];
  return Response.json({ source, items, suggestions });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  if (account.role !== "ADMIN" && !account.canWrite) return writeForbiddenResponse();
  const { id } = await context.params;
  const source = await prisma.purchaseImport.findFirst({ where: { id, ...(account.role === "ADMIN" ? {} : { clerk_user_id: account.dataOwnerId ?? "" }) }, select: { clerk_user_id: true } });
  if (!source) return apiError("NOT_FOUND", "识别记录不存在", 404);
  const parsed = reviewedInvoiceSchema.safeParse(await boundedJson(request, 200000).catch(() => null));
  if (!parsed.success) return apiError("INVALID_REVIEW", "请补全供应商、单号、日期、明细和金额，并确认已核对实收；仅支持 USD 正数单据", 400);
  try {
    const order = await prisma.$transaction((tx) => saveReviewedPurchase(tx, id, source.clerk_user_id, { userId: account.id, name: account.name, email: account.email }, parsed.data), { timeout: 30000 });
    return Response.json({ order });
  } catch (error) {
    if (error instanceof PurchaseImportError) return apiError("IMPORT_REVIEW_FAILED", error.message, 409);
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") return apiError("DUPLICATE_IMPORT", "单据或 SKU 已存在，请刷新采购记录后检查，不要重复创建", 409);
    throw error;
  }
}
