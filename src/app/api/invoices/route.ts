import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessOwner, isAdminScope, isWriteForbiddenScope, ownerWhere, requireAuth, requireWriteAuth, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const start = params.get("start") ? new Date(`${params.get("start")}T00:00:00.000`) : undefined;
  const end = params.get("end") ? new Date(`${params.get("end")}T23:59:59.999`) : undefined;
  const billTo = params.get("bill_to")?.trim();
  const requestedOwner = params.get("account")?.trim();
  const admin = isAdminScope(userId);
  const scope = admin && requestedOwner ? { clerk_user_id: requestedOwner } : ownerWhere(userId);
  const invoices = await prisma.invoiceRecord.findMany({
    where: {
      ...scope,
      ...(start || end ? { issued_at: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
      ...(billTo ? { case: { bill_to_company: { contains: billTo, mode: "insensitive" as const } } } : {}),
    },
    include: { case: { select: { plate: true, vin: true, unit_number: true, customer_name: true, bill_to_company: true } } },
    orderBy: { issued_at: "desc" },
  });
  const [accounts, billToCases] = await Promise.all([
    admin
      ? prisma.appUser.findMany({
        where: { data_owner_id: { not: null } },
        orderBy: { name: "asc" },
        select: { name: true, login: true, data_owner_id: true },
      })
      : Promise.resolve([]),
    prisma.case.findMany({
      where: {
        ...scope,
        bill_to_company: { not: null },
      },
      select: { bill_to_company: true },
      distinct: ["bill_to_company"],
      orderBy: { bill_to_company: "asc" },
    }),
  ]);
  const accountMap = new Map(accounts.map((account) => [account.data_owner_id, account.name]));
  return Response.json({
    invoices: invoices.map((invoice) => ({
      ...invoice,
      owner_name: invoice.clerk_user_id === "__ADMIN__"
        ? "Administrator"
        : accountMap.get(invoice.clerk_user_id) ?? invoice.clerk_user_id,
    })),
    can_filter_accounts: admin,
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
