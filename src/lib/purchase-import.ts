import { z } from "zod";

export const IMPORT_IMAGE_LIMIT = 3_200_000;
export const importKey = (text: string) => text.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();

const extractedLineSchema = z.object({
  item_number: z.string().nullable(),
  description: z.string().nullable(),
  description_zh: z.string().nullable(),
  shipped_qty: z.number().nullable(),
  backordered_qty: z.number().nullable(),
  unit_price: z.string().nullable(),
  line_amount: z.string().nullable(),
  kind: z.enum(["PART", "CORE", "FEE", "UNKNOWN"]),
  warning: z.string().nullable(),
});

// Only shape is guaranteed by the model. Business validation happens independently below.
export const extractedInvoiceSchema = z.object({
  supplier: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  currency: z.string().nullable(),
  lines: z.array(extractedLineSchema),
  subtotal: z.string().nullable(),
  tax: z.string().nullable(),
  shipping: z.string().nullable(),
  surcharge: z.string().nullable(),
  total: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

// Old stored results have no translation; keep them readable without weakening the AI schema.
export const storedExtractedInvoiceSchema = extractedInvoiceSchema.extend({
  lines: z.array(extractedLineSchema.extend({ description_zh: z.string().nullable().default(null) })),
});

export function defaultPurchaseSku(itemNumber: string | null | undefined) {
  const number = itemNumber?.trim() ?? "";
  // Never truncate a part identifier: a missing suffix could identify a different part.
  return number.length <= 50 ? number : "";
}

export function purchaseItemName(description: string, translation?: string | null) {
  const original = description.trim();
  const chinese = translation?.trim() ?? "";
  return !chinese || original.includes(chinese) ? original : `${original} / ${chinese}`;
}

const chineseText = new RegExp("\\p{Script=Han}", "u");

// Only enrich an untranslated, matching catalog name. Never replace a curated name.
export function existingPurchaseItemName(currentName: string, description: string, translation?: string | null) {
  const chinese = translation?.trim() ?? "";
  if (chineseText.test(currentName)) return { name: currentName, reason: "has_chinese" as const };
  if (!chineseText.test(chinese)) return { name: currentName, reason: "missing_translation" as const };
  if (importKey(currentName) !== importKey(description)) return { name: currentName, reason: "different_name" as const };
  const name = purchaseItemName(currentName, chinese);
  if (name.length > 200) return { name: currentName, reason: "too_long" as const };
  return { name, reason: "append" as const };
}

export function purchaseLineDefaults(line: { item_number: string | null; description: string | null; description_zh?: string | null }) {
  return {
    item_number: line.item_number ?? "", description: line.description ?? "",
    description_zh: line.description_zh ?? "", new_sku: defaultPurchaseSku(line.item_number),
  };
}

export function moneyCents(value: string): number | null {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2_000_000_000 ? cents : null;
}
const money = z.string().refine((value) => moneyCents(value) !== null, "金额必须是非负数，最多两位小数");
const date = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "日期无效");
export const reviewedInvoiceSchema = z.object({
  supplier: z.string().trim().min(1).max(200),
  invoice_number: z.string().trim().min(1).max(150),
  invoice_date: date,
  currency: z.literal("USD"),
  subtotal: money, tax: money, shipping: money, surcharge: money, total: money,
  notes: z.string().trim().max(1000),
  confirmed: z.literal(true),
  lines: z.array(z.object({
    item_number: z.string().trim().max(150),
    description: z.string().trim().min(1).max(200),
    description_zh: z.string().trim().max(200).optional(),
    qty: z.number().int().min(0).max(100000),
    unit_price: money,
    line_amount: money,
    kind: z.enum(["PART", "CORE", "FEE"]),
    inventory_item_id: z.string().uuid().nullable(),
    new_sku: z.string().trim().max(50),
    unit: z.string().trim().min(1).max(20),
  })).min(1).max(100),
});
export type ReviewedInvoice = z.infer<typeof reviewedInvoiceSchema>;

export function validateReviewedInvoice(input: ReviewedInvoice): string[] {
  const errors: string[] = [];
  let subtotal = 0;
  input.lines.forEach((line, index) => {
    const amount = moneyCents(line.line_amount)!;
    const calculated = line.qty * moneyCents(line.unit_price)!;
    if (!Number.isSafeInteger(calculated) || calculated > 2_000_000_000 || calculated !== amount) {
      errors.push(`第 ${index + 1} 行：数量 × 单价与行金额不一致，请对照原单核对`);
    }
    if (line.kind === "PART" && line.qty > 0 && !line.inventory_item_id && !line.new_sku) {
      errors.push(`第 ${index + 1} 行：请选择库存 SKU，或填写新 SKU`);
    }
    if (line.kind === "PART" && line.qty > 0 && purchaseItemName(line.description, line.description_zh).length > 200) {
      errors.push(`第 ${index + 1} 行：原文与中文合并后的名称超过 200 字，请精简后保存`);
    }
    if (line.kind === "PART" && /(?:^|[-\s])CORE\b/i.test(line.item_number)) {
      errors.push(`第 ${index + 1} 行：CORE 编号应归类为 CORE 押金，不可作为零件入库`);
    }
    subtotal += amount;
  });
  if (!input.lines.some((line) => line.kind === "PART" && line.qty > 0)) errors.push("至少需要一个实际收货的零件");
  if (subtotal !== moneyCents(input.subtotal)) errors.push("各行金额之和与单据小计不一致");
  const total = subtotal + moneyCents(input.tax)! + moneyCents(input.shipping)! + moneyCents(input.surcharge)!;
  if (total > 2_000_000_000 || total !== moneyCents(input.total)) errors.push("单据小计 + 税费 + 运费 + 其他费用与总额不一致");
  const newSkus = new Map<string, string>();
  for (const line of input.lines.filter((line) => line.kind === "PART" && line.qty > 0 && !line.inventory_item_id)) {
    const key = importKey(line.new_sku);
    const previous = newSkus.get(key);
    const nameAndUnit = `${purchaseItemName(line.description, line.description_zh)}|${line.unit}`;
    if (previous && previous !== nameAndUnit) errors.push(`新 SKU ${line.new_sku} 对应了不同名称或单位，请核对`);
    newSkus.set(key, nameAndUnit);
  }
  const existingTranslations = new Map<string, string>();
  for (const line of input.lines.filter((line) => line.kind === "PART" && line.qty > 0 && line.inventory_item_id)) {
    const translation = line.description_zh?.trim();
    if (!translation) continue;
    const key = line.inventory_item_id!;
    const previous = existingTranslations.get(key);
    if (previous && previous !== importKey(translation)) errors.push("同一个已有 SKU 对应了不同中文译名，请核对后统一");
    existingTranslations.set(key, importKey(translation));
  }
  return errors;
}

export type ImportInventoryItem = { id: string; sku: string; name: string; unit: string };
export function suggestInventoryItem(itemNumber: string, items: ImportInventoryItem[], mappedId?: string) {
  const mapped = items.find((item) => item.id === mappedId);
  if (mapped) return { id: mapped.id, reason: "历史确认的供应商编号" };
  const matches = items.filter((item) => importKey(item.sku) === importKey(itemNumber));
  // No prefix stripping, suffix stripping or fuzzy auto-linking of different parts.
  return itemNumber && matches.length === 1 ? { id: matches[0].id, reason: "SKU 完整匹配" } : null;
}

export function purchaseLineNumberPatch(line: { item_number: string; new_sku: string }, itemNumber: string, items: ImportInventoryItem[]) {
  const followsNumber = !line.new_sku || line.new_sku === defaultPurchaseSku(line.item_number);
  const match = followsNumber ? suggestInventoryItem(itemNumber, items) : null;
  return {
    item_number: itemNumber,
    new_sku: followsNumber ? defaultPurchaseSku(itemNumber) : line.new_sku,
    inventory_item_id: match?.id ?? null,
    match: match?.reason,
  };
}
