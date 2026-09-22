import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { financeDatePreset, financeMidnight, shiftDate } from "./finance-dates";

const dateSchema = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/, "请选择有效日期").refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "请选择有效日期");

export const financeFilterSchema = z.object({
  start: dateSchema,
  end: dateSchema,
  bill_to: z.string().trim().max(200).optional(),
  account: z.string().trim().optional(),
  payment_method: z.string().trim().max(200).optional(),
  payment_method_missing: z.enum(["1"]).optional(),
}).refine((data) => data.start <= data.end, "开始日期不能晚于结束日期")
  .refine((data) => !(data.payment_method && data.payment_method_missing), "付款方式筛选条件不正确");

export type FinanceFilters = z.infer<typeof financeFilterSchema>;

export function parseFinanceFilters(params: URLSearchParams) {
  const defaults = financeDatePreset("month");
  return financeFilterSchema.safeParse({
    ...defaults,
    ...Object.fromEntries([...params].filter(([key]) => ["start", "end", "bill_to", "account", "payment_method", "payment_method_missing"].includes(key))),
  });
}

export function financeInvoiceWhere(scope: { clerk_user_id?: string }, filters: FinanceFilters): Prisma.InvoiceRecordWhereInput {
  const caseFilter: Prisma.CaseWhereInput = {};
  if (filters.bill_to) caseFilter.bill_to_company = { contains: filters.bill_to, mode: "insensitive" };
  if (filters.payment_method) caseFilter.payment_method = { equals: filters.payment_method, mode: "insensitive" };
  if (filters.payment_method_missing) caseFilter.OR = [{ payment_method: null }, { payment_method: "" }];
  return {
    ...scope,
    issued_at: { gte: financeMidnight(filters.start), lt: financeMidnight(shiftDate(filters.end, 1)) },
    ...(Object.keys(caseFilter).length ? { case: caseFilter } : {}),
  };
}

export function paymentMethodOptions(values: Array<string | null>) {
  const unique = new Map<string, string>();
  for (const value of values) {
    const name = value?.trim();
    if (name && !unique.has(name.toLocaleLowerCase())) unique.set(name.toLocaleLowerCase(), name);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
}
