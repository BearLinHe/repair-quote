import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentAccount, unauthorizedResponse, writeForbiddenResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { changePayment } from "@/lib/payment-adjustment";
import { invoicePaidCents, ReconciliationError } from "@/lib/payment-reconciliation";
import { changePaymentSchema, reconciliationInputError } from "@/lib/reconciliation-input";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  const admin = account.role === "ADMIN";
  const ownerId = admin ? "__ADMIN__" : account.dataOwnerId;
  if (!ownerId) return unauthorizedResponse();
  const { id } = await context.params;
  const scope = admin ? {} : { clerk_user_id: ownerId };
  const payment = await prisma.customerPayment.findFirst({ where: { id, ...scope }, include: { allocations: true } });
  if (!payment) return apiError("PAYMENT_NOT_FOUND", "收款不存在或无权操作", 404);
  const [invoices, events] = await Promise.all([
    prisma.invoiceRecord.findMany({
      where: { ...scope, OR: [
        { id: { in: payment.allocations.map((item) => item.invoice_id) } },
        { case: { bill_to_company: { equals: payment.bill_to_company, mode: "insensitive" } }, payment_status: { not: "VOID" } },
      ] },
      select: { id: true, invoice_number: true, issued_at: true, grand_total_cents: true, payment_status: true,
        case: { select: { bill_to_company: true, plate: true, unit_number: true } }, allocations: { select: { payment_id: true, amount_cents: true } } },
      orderBy: [{ issued_at: "asc" }, { id: "asc" }],
    }),
    prisma.auditLog.findMany({ where: { entity_type: "PAYMENT", entity_id: id },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { id: true, created_at: true, actor_name: true, action: true, details: true } }),
  ]);
  const allocated = payment.allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  return Response.json({
    payment: { id: payment.id, bill_to_company: payment.bill_to_company, received_at: payment.received_at,
      amount_cents: payment.amount_cents, allocated_cents: allocated, remaining_cents: payment.voided_at ? 0 : payment.amount_cents - allocated,
      payment_method: payment.payment_method, reference_number: payment.reference_number, revision: payment.revision,
      voided_at: payment.voided_at, void_reason: payment.void_reason, voided_by_name: payment.voided_by_name },
    can_write: (admin || account.canWrite) && !payment.voided_at,
    invoices: invoices.map((invoice) => {
      const current = invoice.allocations.filter((item) => item.payment_id === id).reduce((sum, item) => sum + item.amount_cents, 0);
      const otherPaid = Math.max(0, invoicePaidCents(invoice) - current);
      const sameCompany = invoice.case.bill_to_company?.trim().toLowerCase() === payment.bill_to_company.trim().toLowerCase();
      const canIncrease = sameCompany && invoice.payment_status !== "VOID";
      return { ...invoice, allocations: undefined, allocated_cents: current, other_paid_cents: otherPaid,
        max_allocation_cents: canIncrease ? Math.max(current, invoice.grand_total_cents - otherPaid) : current };
    }).filter((invoice) => invoice.allocated_cents > 0 || invoice.max_allocation_cents > 0),
    events,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest, context: Context) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  if (account.role !== "ADMIN" && !account.canWrite) return writeForbiddenResponse();
  const ownerId = account.role === "ADMIN" ? "__ADMIN__" : account.dataOwnerId;
  if (!ownerId) return unauthorizedResponse();
  const parsed = changePaymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", reconciliationInputError(parsed.error, "调整信息格式不正确", true), 400);
  const { id } = await context.params;
  try {
    const data = parsed.data;
    const result = await prisma.$transaction((tx) => changePayment(tx, {
      paymentId: id, expectedRevision: data.expected_revision, reason: data.reason, action: data.action,
      allocations: data.action === "adjust" ? data.allocations : undefined,
      scope: { ownerId, isAdmin: account.role === "ADMIN" }, actor: { userId: account.id, name: account.name, email: account.email },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ReconciliationError) return apiError(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return apiError("CONCURRENT_UPDATE", "收款或 Invoice 刚刚发生变动，请刷新后重试", 409);
    console.error("Payment adjustment failed", error);
    return apiError("ADJUSTMENT_FAILED", "未能确认操作结果，请刷新收款记录后核对", 500);
  }
}
