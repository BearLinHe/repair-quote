import { z } from "zod";
import { invoiceIdSchema } from "./invoice-id";

export const MAX_INVOICE_EXPORT_COUNT = 300;

export const selectedInvoiceExportSchema = z.object({
  ids: z.array(invoiceIdSchema).min(1).max(MAX_INVOICE_EXPORT_COUNT).refine(
    (ids) => new Set(ids).size === ids.length,
    "请勿重复选择 Invoice，请刷新账单列表后重试",
  ),
});

export function invoiceExportInputError(error: z.ZodError) {
  if (error.issues.some((issue) => issue.path[0] === "ids" && typeof issue.path[1] === "number")) {
    return "所选 Invoice 的标识格式不正确，请刷新账单列表后重试";
  }
  if (error.issues.some((issue) => issue.path[0] === "ids" && issue.code === "too_small")) {
    return "请选择需要导出的 Invoice";
  }
  if (error.issues.some((issue) => issue.path[0] === "ids" && issue.code === "too_big")) {
    return `每次最多导出 ${MAX_INVOICE_EXPORT_COUNT} 张 Invoice，请减少选择数量`;
  }
  if (error.issues.some((issue) => issue.path[0] === "ids" && issue.code === "custom")) {
    return "请勿重复选择 Invoice，请刷新账单列表后重试";
  }
  return "导出参数无效，请刷新账单列表后重试";
}
