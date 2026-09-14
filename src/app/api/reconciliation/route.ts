import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  canAccessOwner,
  getCurrentAccount,
  isAdminScope,
  isWriteForbiddenScope,
  ownerWhere,
  requireWriteAuth,
  unauthorizedResponse,
  writeForbiddenResponse,
} from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";
import { invoicePaidCents as centsPaid } from "@/lib/payment-reconciliation";

export async function GET(req: NextRequest) {
  const currentAccount = await getCurrentAccount();
  if (!currentAccount) return unauthorizedResponse();
  const userId = currentAccount.role === "ADMIN" ? "__ADMIN__" : currentAccount.dataOwnerId;
  if (!userId) return unauthorizedResponse();

  const params = new URL(req.url).searchParams;
  const start = params.get("start") ? new Date(`${params.get("start")}T00:00:00.000`) : undefined;
  const end = params.get("end") ? new Date(`${params.get("end")}T23:59:59.999`) : undefined;
  const billTo = params.get("bill_to")?.trim();
  const requestedOwner = params.get("account")?.trim();
  const admin = isAdminScope(userId);
  const scope = admin && requestedOwner ? { clerk_user_id: requestedOwner } : ownerWhere(userId);

  const invoiceWhere = {
    ...scope,
    payment_status: { not: "VOID" as const },
    ...(start || end ? { issued_at: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    ...(billTo ? { case: { bill_to_company: { contains: billTo, mode: "insensitive" as const } } } : {}),
  };
  const paymentWhere = {
    ...scope,
    ...(start || end ? { received_at: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
    ...(billTo ? { bill_to_company: { contains: billTo, mode: "insensitive" as const } } : {}),
  };

  const [rawInvoices, payments, billToCases, accounts] = await Promise.all([
    prisma.invoiceRecord.findMany({
      where: invoiceWhere,
      include: {
        case: { select: { bill_to_company: true, plate: true, unit_number: true, customer_name: true } },
        allocations: { select: { amount_cents: true } },
      },
      orderBy: [{ issued_at: "asc" }, { created_at: "asc" }],
    }),
    prisma.customerPayment.findMany({
      where: paymentWhere,
      include: {
        allocations: {
          include: { invoice: { select: { invoice_number: true } } },
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: [{ received_at: "desc" }, { created_at: "desc" }],
      take: 200,
    }),
    prisma.case.findMany({
      where: { ...scope, bill_to_company: { not: null } },
      select: { bill_to_company: true },
      distinct: ["bill_to_company"],
      orderBy: { bill_to_company: "asc" },
    }),
    admin
      ? prisma.appUser.findMany({
          where: { data_owner_id: { not: null }, is_active: true },
          select: { name: true, login: true, data_owner_id: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const invoices = rawInvoices.map((invoice) => {
    const paidCents = Math.min(invoice.grand_total_cents, centsPaid(invoice));
    return {
      id: invoice.id,
      case_id: invoice.case_id,
      invoice_number: invoice.invoice_number,
      issued_at: invoice.issued_at,
      clerk_user_id: invoice.clerk_user_id,
      grand_total_cents: invoice.grand_total_cents,
      paid_cents: paidCents,
      outstanding_cents: Math.max(0, invoice.grand_total_cents - paidCents),
      payment_status: invoice.payment_status,
      case: invoice.case,
    };
  });
  const openInvoices = invoices.filter((invoice) => invoice.outstanding_cents > 0);
  const totalReceivable = invoices.reduce((sum, invoice) => sum + invoice.grand_total_cents, 0);
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.outstanding_cents, 0);

  return Response.json({
    invoices: openInvoices,
    payments: payments.map((payment) => ({
      ...payment,
      allocated_cents: payment.allocations.reduce((sum, allocation) => sum + allocation.amount_cents, 0),
    })),
    summary: {
      invoice_count: invoices.length,
      open_invoice_count: openInvoices.length,
      receivable_cents: totalReceivable,
      received_cents: totalReceivable - totalOutstanding,
      outstanding_cents: totalOutstanding,
      unapplied_cents: payments.reduce(
        (sum, payment) => sum + Math.max(0, payment.amount_cents - payment.allocations.reduce((allocated, item) => allocated + item.amount_cents, 0)),
        0,
      ),
    },
    bill_to_options: billToCases.map((item) => item.bill_to_company?.trim()).filter((value): value is string => Boolean(value)),
    can_filter_accounts: admin,
    can_write: admin || Boolean(currentAccount?.canWrite),
    accounts: accounts.map((account) => ({ id: account.data_owner_id, name: account.name, login: account.login })),
  });
}

const createPaymentSchema = z.object({
  bill_to_company: z.string().trim().min(1).max(200),
  received_at: z.string().min(1),
  amount_cents: z.number().int().positive(),
  payment_method: z.string().trim().min(1).max(100),
  reference_number: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  account: z.string().trim().optional().nullable(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount_cents: z.number().int().positive() })),
});

export async function POST(req: NextRequest) {
  const userId = await requireWriteAuth();
  if (!userId) return unauthorizedResponse();
  if (isWriteForbiddenScope(userId)) return writeForbiddenResponse();
  const parsed = createPaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "收款信息格式不正确", 400, parsed.error.flatten());

  const data = parsed.data;
  const allocationTotal = data.allocations.reduce((sum, allocation) => sum + allocation.amount_cents, 0);
  if (allocationTotal > data.amount_cents) return apiError("ALLOCATION_EXCEEDS_PAYMENT", "销账金额不能超过本次收款金额", 400);
  if (new Set(data.allocations.map((allocation) => allocation.invoice_id)).size !== data.allocations.length) {
    return apiError("DUPLICATE_INVOICE", "同一张 Invoice 不能重复分配", 400);
  }
  const receivedAt = new Date(`${data.received_at}T12:00:00.000`);
  if (Number.isNaN(receivedAt.getTime())) return apiError("INVALID_DATE", "收款日期不正确", 400);

  const actor = await getAuditActor(userId);
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const invoiceIds = data.allocations.map((allocation) => allocation.invoice_id);
      const invoices = invoiceIds.length
        ? await tx.invoiceRecord.findMany({
            where: { id: { in: invoiceIds } },
            include: { case: { select: { bill_to_company: true } }, allocations: { select: { amount_cents: true } } },
          })
        : [];
      if (invoices.length !== invoiceIds.length) throw new Error("INVOICE_NOT_FOUND");
      const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
      for (const allocation of data.allocations) {
        const invoice = invoiceMap.get(allocation.invoice_id)!;
        if (!canAccessOwner(userId, invoice.clerk_user_id)) throw new Error("INVOICE_NOT_FOUND");
        if (invoice.payment_status === "VOID") throw new Error("INVOICE_VOID");
        if ((invoice.case.bill_to_company ?? "").trim().toLocaleLowerCase() !== data.bill_to_company.toLocaleLowerCase()) throw new Error("BILL_TO_MISMATCH");
        const outstanding = Math.max(0, invoice.grand_total_cents - centsPaid(invoice));
        if (allocation.amount_cents > outstanding) throw new Error(`OVERPAY:${invoice.invoice_number}`);
      }

      const ownerId = isAdminScope(userId)
        ? data.account || invoices[0]?.clerk_user_id || "__ADMIN__"
        : userId;
      const created = await tx.customerPayment.create({
        data: {
          clerk_user_id: ownerId,
          bill_to_company: data.bill_to_company,
          received_at: receivedAt,
          amount_cents: data.amount_cents,
          payment_method: data.payment_method,
          reference_number: data.reference_number || null,
          note: data.note || null,
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
          created_by_email: actor.email,
          allocations: { create: data.allocations.map((allocation) => ({ invoice_id: allocation.invoice_id, amount_cents: allocation.amount_cents })) },
        },
      });

      for (const allocation of data.allocations) {
        const invoice = invoiceMap.get(allocation.invoice_id)!;
        const paid = centsPaid(invoice) + allocation.amount_cents;
        await tx.invoiceRecord.update({
          where: { id: invoice.id },
          data: { payment_status: paid >= invoice.grand_total_cents ? "PAID" : "PARTIAL" },
        });
      }
      await tx.auditLog.create({
        data: auditData(actor, {
          action: "PAYMENT_RECONCILED",
          entityType: "PAYMENT",
          entityId: created.id,
          entityLabel: data.reference_number || data.bill_to_company,
          details: {
            bill_to_company: data.bill_to_company,
            amount_cents: data.amount_cents,
            allocated_cents: allocationTotal,
            invoice_count: data.allocations.length,
          },
        }),
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return apiError("CONCURRENT_UPDATE", "Invoice 余额刚刚发生变动，请刷新后重新分配", 409);
    }
    const message = error instanceof Error ? error.message : "";
    if (message === "INVOICE_NOT_FOUND") return apiError("INVOICE_NOT_FOUND", "Invoice 不存在或无权操作", 404);
    if (message === "INVOICE_VOID") return apiError("INVOICE_VOID", "已作废的 Invoice 不能销账", 400);
    if (message === "BILL_TO_MISMATCH") return apiError("BILL_TO_MISMATCH", "所选 Invoice 不属于当前 Bill To", 400);
    if (message.startsWith("OVERPAY:")) return apiError("ALLOCATION_EXCEEDS_BALANCE", `${message.slice(8)} 的销账金额超过未付余额`, 400);
    throw error;
  }
}
