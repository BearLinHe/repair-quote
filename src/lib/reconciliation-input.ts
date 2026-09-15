import { z } from "zod";

const uuidSchema = z.string().uuid();
// Imported invoices use 32-character hex IDs; newer records use UUIDs.
// Preserve the original ID: ownership and existence are checked in the transaction.
const invoiceIdSchema = z.string().refine(
  (id) => /^[0-9a-f]{32}$/i.test(id) || uuidSchema.safeParse(id).success,
  "Invoice 标识格式不正确，请刷新账单列表后重试",
);

const allocationItemSchema = z.object({
  invoice_id: invoiceIdSchema,
  amount_cents: z.number().int().positive().max(2147483647),
});

export const continuePaymentSchema = z.object({
  expected_allocated_cents: z.number().int().min(0).max(2147483647),
  allocations: z.array(allocationItemSchema).min(1).max(500),
});

export const createPaymentSchema = z.object({
  bill_to_company: z.string().trim().min(1).max(200),
  received_at: z.string().min(1),
  amount_cents: z.number().int().positive().max(2147483647),
  payment_method: z.string().trim().min(1).max(100),
  reference_number: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  account: z.string().trim().optional().nullable(),
  allocations: z.array(allocationItemSchema).max(500),
});

export function reconciliationInputError(error: z.ZodError, fallback: string) {
  if (error.issues.some((issue) => issue.path.includes("invoice_id"))) {
    return "Invoice 标识格式不正确，请刷新账单列表后重试";
  }
  if (error.issues.some((issue) => issue.path[0] === "expected_allocated_cents")) {
    return "收款余额信息不正确，请刷新余额后重试";
  }
  if (error.issues.some((issue) => issue.path[0] === "allocations" && issue.path.includes("amount_cents"))) {
    return "请填写有效的 Invoice 销账金额，金额须大于零且最多两位小数";
  }
  if (error.issues.some((issue) => issue.path[0] === "allocations")) {
    return "请分配 1 至 500 张 Invoice；仅登记收款时可暂不分配";
  }
  if (error.issues.some((issue) => issue.path[0] === "amount_cents")) {
    return "请填写有效的收款金额，金额须大于零且最多两位小数";
  }
  return fallback;
}
