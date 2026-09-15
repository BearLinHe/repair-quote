import type { Prisma } from "@prisma/client";
import { invoicePaidCents, ReconciliationError } from "./payment-reconciliation";

type Allocation = { invoice_id: string; amount_cents: number };
type Invoice = {
  id: string; invoice_number: string; clerk_user_id: string; grand_total_cents: number;
  payment_status: string; case: { bill_to_company: string | null };
  allocations: { payment_id: string; amount_cents: number }[];
};
type Payment = {
  id: string; clerk_user_id: string; amount_cents: number; bill_to_company: string;
  revision: number; voided_at: Date | null; allocations: Allocation[];
};
type ChangeInput = {
  payment: Payment; invoices: Invoice[]; expectedRevision: number; reason: string;
  action: "adjust" | "void"; allocations?: Allocation[]; scope: { ownerId: string; isAdmin: boolean };
};

export function planPaymentChange(input: ChangeInput) {
  const { payment, invoices, scope } = input;
  if (!scope.isAdmin && payment.clerk_user_id !== scope.ownerId) throw new ReconciliationError("PAYMENT_NOT_FOUND", "收款不存在或无权操作", 404);
  if (payment.voided_at) throw new ReconciliationError("PAYMENT_VOIDED", "该收款已作废，请刷新记录", 409);
  if (payment.revision !== input.expectedRevision) throw new ReconciliationError("STALE_PAYMENT", "收款分配已发生变动，请刷新后重新调整", 409);
  if (!input.reason.trim() || input.reason.trim().length > 1000) throw new ReconciliationError("REASON_REQUIRED", "请填写操作原因（最多 1000 字）");
  const requested = input.action === "void"
    ? payment.allocations.filter((item) => item.amount_cents > 0).map((item) => ({ ...item, amount_cents: 0 }))
    : input.allocations ?? [];
  if (new Set(requested.map((item) => item.invoice_id)).size !== requested.length) throw new ReconciliationError("DUPLICATE_INVOICE", "同一张 Invoice 不能重复调整");
  if (requested.some((item) => !Number.isSafeInteger(item.amount_cents) || item.amount_cents < 0 || item.amount_cents > 2147483647)) {
    throw new ReconciliationError("INVALID_AMOUNT", "调整后的分配金额必须为零或有效正数");
  }
  const current = new Map(payment.allocations.map((item) => [item.invoice_id, item.amount_cents]));
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const changes = requested.filter((item) => item.amount_cents !== (current.get(item.invoice_id) ?? 0)).map((item) => {
    const invoice = invoiceMap.get(item.invoice_id);
    if (!invoice || (!scope.isAdmin && invoice.clerk_user_id !== scope.ownerId)) throw new ReconciliationError("INVOICE_NOT_FOUND", "Invoice 不存在或无权调整", 404);
    const before = current.get(item.invoice_id) ?? 0;
    const delta = item.amount_cents - before;
    // A previously linked invoice can be released even if its Bill To/status changed.
    if (delta > 0 && invoice.payment_status === "VOID") throw new ReconciliationError("INVOICE_VOID", "已作废的 Invoice 不能增加分配");
    if (delta > 0 && (invoice.case.bill_to_company ?? "").trim().toLowerCase() !== payment.bill_to_company.trim().toLowerCase()) {
      throw new ReconciliationError("BILL_TO_MISMATCH", "只能向本收款 Bill To 公司的 Invoice 增加分配");
    }
    const paidBefore = invoicePaidCents(invoice);
    const paidAfter = paidBefore + delta;
    if (paidAfter < 0 || (delta > 0 && paidAfter > invoice.grand_total_cents)) throw new ReconciliationError("ALLOCATION_EXCEEDS_BALANCE", `${invoice.invoice_number} 的分配金额超过可收余额`);
    const status = invoice.payment_status === "VOID" ? "VOID" as const : paidAfter <= 0 ? "UNPAID" as const : paidAfter >= invoice.grand_total_cents ? "PAID" as const : "PARTIAL" as const;
    return { invoice_id: invoice.id, invoice_number: invoice.invoice_number, before_cents: before, after_cents: item.amount_cents,
      delta_cents: delta, invoice_paid_before_cents: paidBefore, invoice_paid_after_cents: paidAfter,
      invoice_outstanding_after_cents: Math.max(0, invoice.grand_total_cents - paidAfter), payment_status: status };
  });
  if (input.action === "adjust" && !changes.length) throw new ReconciliationError("NO_CHANGES", "分配金额没有变化");
  const beforeTotal = payment.allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  const afterTotal = beforeTotal + changes.reduce((sum, item) => sum + item.delta_cents, 0);
  if (!Number.isSafeInteger(afterTotal) || afterTotal < 0 || afterTotal > payment.amount_cents) throw new ReconciliationError("ALLOCATION_EXCEEDS_PAYMENT", "调整后的分配总额不能超过收款金额");
  return { changes, beforeTotal, afterTotal, remaining: input.action === "void" ? 0 : payment.amount_cents - afterTotal };
}

// The receipt, current allocations, invoice status and immutable audit entry commit together.
export async function changePayment(tx: Prisma.TransactionClient, input: {
  paymentId: string; expectedRevision: number; reason: string; action: "adjust" | "void"; allocations?: Allocation[];
  scope: { ownerId: string; isAdmin: boolean }; actor: { userId: string; name: string; email: string | null };
}) {
  const payment = await tx.customerPayment.findUnique({ where: { id: input.paymentId }, include: { allocations: true } });
  if (!payment || (!input.scope.isAdmin && payment.clerk_user_id !== input.scope.ownerId)) throw new ReconciliationError("PAYMENT_NOT_FOUND", "收款不存在或无权操作", 404);
  const ids = [...new Set([...payment.allocations.map((item) => item.invoice_id), ...(input.allocations ?? []).map((item) => item.invoice_id)])];
  const invoices = await tx.invoiceRecord.findMany({ where: { id: { in: ids } }, include: { case: { select: { bill_to_company: true } }, allocations: true } });
  const plan = planPaymentChange({ ...input, payment, invoices });
  const guard = await tx.customerPayment.updateMany({ where: { id: payment.id, revision: input.expectedRevision, voided_at: null }, data: {
    revision: { increment: 1 }, updated_at: new Date(),
    ...(input.action === "void" ? { voided_at: new Date(), void_reason: input.reason.trim(), voided_by_name: input.actor.name } : {}),
  } });
  if (guard.count !== 1) throw new ReconciliationError("STALE_PAYMENT", "收款已被其他人修改，请刷新后重试", 409);
  for (const item of plan.changes) {
    await tx.paymentAllocation.upsert({ where: { payment_id_invoice_id: { payment_id: payment.id, invoice_id: item.invoice_id } },
      create: { payment_id: payment.id, invoice_id: item.invoice_id, amount_cents: item.after_cents },
      update: { amount_cents: item.after_cents } });
    await tx.invoiceRecord.update({ where: { id: item.invoice_id }, data: { payment_status: item.payment_status } });
  }
  await tx.auditLog.create({ data: {
    actor_user_id: input.actor.userId, actor_name: input.actor.name, actor_email: input.actor.email,
    entity_type: "PAYMENT", entity_id: payment.id, entity_label: payment.reference_number || payment.bill_to_company,
    action: input.action === "void" ? "PAYMENT_VOIDED" : "PAYMENT_ALLOCATION_ADJUSTED",
    details: { reason: input.reason.trim(), bill_to_company: payment.bill_to_company, amount_cents: payment.amount_cents,
      before_allocated_cents: plan.beforeTotal, after_allocated_cents: plan.afterTotal,
      before_remaining_cents: payment.amount_cents - plan.beforeTotal, after_remaining_cents: plan.remaining,
      before_revision: payment.revision, after_revision: payment.revision + 1, changes: plan.changes },
  } });
  return { payment_id: payment.id, allocated_cents: plan.afterTotal, remaining_cents: plan.remaining, voided: input.action === "void" };
}
