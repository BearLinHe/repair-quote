import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentAccount, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { allocateExistingPayment, invoicePaidCents, ReconciliationError } from "@/lib/payment-reconciliation";
import { continuePaymentSchema, reconciliationInputError } from "@/lib/reconciliation-input";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  const { id } = await context.params;
  const admin = account.role === "ADMIN";
  const ownerId = admin ? "__ADMIN__" : account.dataOwnerId;
  if (!ownerId) return unauthorizedResponse();
  const payment = await prisma.customerPayment.findFirst({
    where: { id, ...(!admin ? { clerk_user_id: ownerId } : {}) },
    select: {
      id: true, bill_to_company: true, received_at: true, amount_cents: true,
      payment_method: true, reference_number: true, created_by_name: true,
      revision: true, voided_at: true,
      allocations: { select: { amount_cents: true } },
    },
  });
  if (!payment) return apiError("PAYMENT_NOT_FOUND", "收款记录不存在或无权操作", 404);
  if (payment.voided_at) return apiError("PAYMENT_VOIDED", "该收款已作废，不能继续销账", 409);
  // The receipt determines the company; invoice dates are deliberately unrestricted.
  const invoices = await prisma.invoiceRecord.findMany({
    where: {
      ...(!admin ? { clerk_user_id: ownerId } : {}),
      payment_status: { not: "VOID" },
      case: { bill_to_company: { equals: payment.bill_to_company, mode: "insensitive" } },
    },
    select: {
      id: true, case_id: true, invoice_number: true, issued_at: true,
      grand_total_cents: true, payment_status: true,
      allocations: { select: { amount_cents: true } },
      case: { select: { plate: true, unit_number: true } },
    },
    orderBy: [{ issued_at: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });
  const allocated = payment.allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  return Response.json({
    payment: { ...payment, allocations: undefined, allocated_cents: allocated, remaining_cents: Math.max(0, payment.amount_cents - allocated) },
    can_write: admin || account.canWrite,
    invoices: invoices.map((invoice) => {
      const paid = invoicePaidCents(invoice);
      return { ...invoice, allocations: undefined, paid_cents: paid, outstanding_cents: Math.max(0, invoice.grand_total_cents - paid) };
    }).filter((invoice) => invoice.outstanding_cents > 0),
  });
}

export async function PATCH(req: NextRequest, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  if (account.role !== "ADMIN" && !account.canWrite) return writeForbiddenResponse();
  const ownerId = account.role === "ADMIN" ? "__ADMIN__" : account.dataOwnerId;
  if (!ownerId) return unauthorizedResponse();
  const { id } = await context.params;
  const parsed = continuePaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", reconciliationInputError(parsed.error, "销账信息格式不正确，请刷新后重试"), 400, parsed.error.flatten());
  try {
    const result = await prisma.$transaction((tx) => allocateExistingPayment(tx, {
      paymentId: id,
      expectedAllocatedCents: parsed.data.expected_allocated_cents,
      expectedRevision: parsed.data.expected_revision,
      allocations: parsed.data.allocations,
      scope: { ownerId, isAdmin: account.role === "ADMIN" },
      actor: { userId: account.id, name: account.name, email: account.email },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ReconciliationError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return apiError("CONCURRENT_UPDATE", "收款或 Invoice 余额刚刚发生变动，请刷新后重新分配", 409);
    }
    console.error("Payment allocation failed", error);
    return apiError("ALLOCATION_FAILED", "销账未完成，请刷新余额后重试", 500);
  }
}
