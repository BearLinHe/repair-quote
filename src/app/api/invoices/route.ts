import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessOwner, isAdminScope, isWriteForbiddenScope, ownerWhere, requireAuth, requireWriteAuth, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";
import { financeInvoiceWhere, parseFinanceFilters, paymentMethodOptions } from "@/lib/finance-query";
import { invoicePartUsage } from "@/lib/invoice-parts";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const parsed = parseFinanceFilters(params);
  if (!parsed.success) return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "筛选条件不正确", 400);
  const requestedOwner = parsed.data.account;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(10, Number.parseInt(params.get("page_size") ?? "20", 10) || 20));
  const admin = isAdminScope(userId);
  const scope = admin && requestedOwner ? { clerk_user_id: requestedOwner } : ownerWhere(userId);
  const where = financeInvoiceWhere(scope, parsed.data);
  const [invoices, total, accounts, billToCases, methods] = await Promise.all([
    prisma.invoiceRecord.findMany({
      where,
      include: { case: { select: { plate: true, vin: true, unit_number: true, customer_name: true, bill_to_company: true, payment_method: true, parts: { select: { name: true, qty: true }, orderBy: { created_at: "asc" } } } } },
      orderBy: [{ issued_at: "desc" }, { created_at: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.invoiceRecord.count({ where }),
    prisma.appUser.findMany({
        where: admin ? { data_owner_id: { not: null } } : { data_owner_id: userId },
        orderBy: { name: "asc" },
        select: { name: true, login: true, data_owner_id: true },
      }),
    prisma.case.findMany({
      where: {
        ...scope,
        bill_to_company: { not: null },
      },
      select: { bill_to_company: true },
      distinct: ["bill_to_company"],
      orderBy: { bill_to_company: "asc" },
    }),
    prisma.case.findMany({ where: { ...scope, invoice: { isNot: null } }, select: { payment_method: true }, distinct: ["payment_method"], orderBy: { payment_method: "asc" } }),
  ]);
  const accountMap = new Map(accounts.map((account) => [account.data_owner_id, account.name]));
  return Response.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
      part_usage: invoicePartUsage(invoice.snapshot, invoice.case.parts),
      payment_method: invoice.case.payment_method?.trim() || null,
      owner_name: invoice.clerk_user_id === "__ADMIN__"
        ? "Administrator"
        : accountMap.get(invoice.clerk_user_id) ?? invoice.clerk_user_id,
    })),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
    can_filter_accounts: admin,
    payment_method_options: paymentMethodOptions(methods.map((item) => item.payment_method)),
    bill_to_options: billToCases
      .map((item) => item.bill_to_company?.trim())
      .filter((value): value is string => Boolean(value)),
    accounts: admin
      ? [
          { id: "__ADMIN__", name: "Administrator", login: "admin" },
          ...accounts.map((account) => ({ id: account.data_owner_id, name: account.name, login: account.login })),
        ]
      : [],
  });
}

const paymentSchema = z.object({
  id: z.string().uuid(),
  payment_status: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]),
});

export async function PATCH(req: NextRequest) {
  const userId = await requireWriteAuth();
  if (!userId) return unauthorizedResponse();
  if (isWriteForbiddenScope(userId)) return writeForbiddenResponse();
  const parsed = paymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "付款状态格式不正确", 400);
  const invoice = await prisma.invoiceRecord.findUnique({ where: { id: parsed.data.id } });
  if (!invoice || !canAccessOwner(userId, invoice.clerk_user_id)) return apiError("INVOICE_NOT_FOUND", "Invoice 不存在", 404);
  const actor = await getAuditActor(userId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoiceRecord.update({ where: { id: invoice.id }, data: { payment_status: parsed.data.payment_status } });
    await tx.auditLog.create({ data: auditData(actor, { action: "INVOICE_PAYMENT_UPDATED", entityType: "INVOICE", entityId: invoice.id, entityLabel: invoice.invoice_number, details: { from_status: invoice.payment_status, to_status: parsed.data.payment_status } }) });
    return result;
  });
  return Response.json(updated);
}
