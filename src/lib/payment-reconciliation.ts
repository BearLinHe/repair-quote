import type { Prisma } from "@prisma/client";

type Allocation = { invoice_id: string; amount_cents: number };
type InvoiceBalance = {
  id: string;
  invoice_number: string;
  clerk_user_id: string;
  grand_total_cents: number;
  payment_status: string;
  case: { bill_to_company: string | null };
  allocations: { amount_cents: number }[];
};

export class ReconciliationError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function invoicePaidCents(invoice: Pick<InvoiceBalance, "grand_total_cents" | "payment_status" | "allocations">) {
  const allocated = invoice.allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  // Preserve fully paid invoices marked before the allocation ledger was introduced.
  return allocated === 0 && invoice.payment_status === "PAID" ? invoice.grand_total_cents : allocated;
}

export function planPaymentAllocation(input: {
  payment: { amount_cents: number; bill_to_company: string; allocations: { amount_cents: number }[] };
  expectedAllocatedCents: number;
  allocations: Allocation[];
  invoices: InvoiceBalance[];
  scope: { ownerId: string; isAdmin: boolean };
}) {
  const { payment, allocations, invoices, scope } = input;
  const previous = payment.allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  if (previous !== input.expectedAllocatedCents) {
    throw new ReconciliationError("STALE_PAYMENT", "这笔收款的余额已变动，请刷新后重新分配", 409);
  }
  if (!allocations.length || allocations.some((item) => !Number.isSafeInteger(item.amount_cents) || item.amount_cents <= 0)) {
    throw new ReconciliationError("INVALID_AMOUNT", "请至少填写一张 Invoice 的销账金额，金额须大于零");
  }
  if (new Set(allocations.map((item) => item.invoice_id)).size !== allocations.length) {
    throw new ReconciliationError("DUPLICATE_INVOICE", "同一张 Invoice 不能重复分配");
  }
  const total = allocations.reduce((sum, item) => sum + item.amount_cents, 0);
  if (!Number.isSafeInteger(total) || total > payment.amount_cents - previous) {
    throw new ReconciliationError("ALLOCATION_EXCEEDS_PAYMENT", "本次销账金额超过这笔收款的未分配余额");
  }
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const updates = allocations.map((allocation) => {
    const invoice = invoiceMap.get(allocation.invoice_id);
    if (!invoice || (!scope.isAdmin && invoice.clerk_user_id !== scope.ownerId)) {
      throw new ReconciliationError("INVOICE_NOT_FOUND", "Invoice 不存在或无权操作", 404);
    }
    if (invoice.payment_status === "VOID") throw new ReconciliationError("INVOICE_VOID", "已作废的 Invoice 不能销账");
    if ((invoice.case.bill_to_company ?? "").trim().toLowerCase() !== payment.bill_to_company.trim().toLowerCase()) {
      throw new ReconciliationError("BILL_TO_MISMATCH", "所选 Invoice 不属于这笔收款的 Bill To");
    }
    const paid = invoicePaidCents(invoice) + allocation.amount_cents;
    if (paid > invoice.grand_total_cents) {
      throw new ReconciliationError("ALLOCATION_EXCEEDS_BALANCE", `${invoice.invoice_number} 的销账金额超过未付余额`);
    }
    return { ...allocation, payment_status: paid === invoice.grand_total_cents ? "PAID" as const : "PARTIAL" as const };
  });
  return { total, allocatedCents: previous + total, remainingCents: payment.amount_cents - previous - total, updates };
}

// Call inside a Serializable transaction: allocations, invoice statuses, and audit commit together.
export async function allocateExistingPayment(tx: Prisma.TransactionClient, input: {
  paymentId: string;
  expectedAllocatedCents: number;
  expectedRevision?: number;
  allocations: Allocation[];
  scope: { ownerId: string; isAdmin: boolean };
  actor: { userId: string; name: string; email: string | null };
}) {
  const payment = await tx.customerPayment.findUnique({ where: { id: input.paymentId }, include: { allocations: true } });
  if (!payment || (!input.scope.isAdmin && payment.clerk_user_id !== input.scope.ownerId)) {
    throw new ReconciliationError("PAYMENT_NOT_FOUND", "收款记录不存在或无权操作", 404);
  }
  if (payment.voided_at) throw new ReconciliationError("PAYMENT_VOIDED", "该收款已作废，不能继续销账", 409);
  if (input.expectedRevision !== undefined && input.expectedRevision !== payment.revision) {
    throw new ReconciliationError("STALE_PAYMENT", "收款分配已发生变动，请刷新后重试", 409);
  }
  const invoices = await tx.invoiceRecord.findMany({
    where: { id: { in: input.allocations.map((item) => item.invoice_id) } },
    include: { case: { select: { bill_to_company: true } }, allocations: { select: { amount_cents: true } } },
  });
  const plan = planPaymentAllocation({ ...input, payment, invoices });
  for (const update of plan.updates) {
    await tx.paymentAllocation.upsert({
      where: { payment_id_invoice_id: { payment_id: payment.id, invoice_id: update.invoice_id } },
      create: { payment_id: payment.id, invoice_id: update.invoice_id, amount_cents: update.amount_cents },
      update: { amount_cents: { increment: update.amount_cents } },
    });
    await tx.invoiceRecord.update({ where: { id: update.invoice_id }, data: { payment_status: update.payment_status } });
  }
  await tx.customerPayment.update({ where: { id: payment.id }, data: { revision: { increment: 1 }, updated_at: new Date() } });
  await tx.auditLog.create({ data: {
    actor_user_id: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    action: "PAYMENT_ALLOCATION_ADDED",
    entity_type: "PAYMENT",
    entity_id: payment.id,
    entity_label: payment.reference_number || payment.bill_to_company,
    details: {
      bill_to_company: payment.bill_to_company,
      amount_cents: payment.amount_cents,
      newly_allocated_cents: plan.total,
      allocated_cents: plan.allocatedCents,
      remaining_cents: plan.remainingCents,
      allocations: input.allocations.map((item) => ({ ...item, invoice_number: invoices.find((invoice) => invoice.id === item.invoice_id)!.invoice_number })),
    },
  } });
  return { payment_id: payment.id, allocated_cents: plan.allocatedCents, remaining_cents: plan.remainingCents };
}
