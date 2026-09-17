import { parsePaymentCents } from "./reconciliation-view";

export type AdjustmentInvoice = {
  id: string; invoice_number: string; issued_at: string; grand_total_cents: number;
  allocated_cents: number; other_paid_cents: number; max_allocation_cents: number;
  case: { plate: string | null; unit_number: string | null };
};

export function adjustmentPreview(invoices: AdjustmentInvoice[], amounts: Record<string, string>, receiptAmount: number, currentlyAllocated: number) {
  let invalid = false;
  const changes = invoices.flatMap((invoice) => {
    const amount = parsePaymentCents(amounts[invoice.id] ?? "");
    if (amount === null || amount > invoice.max_allocation_cents) invalid = true;
    return amount !== null && amount !== invoice.allocated_cents
      ? [{ invoice_id: invoice.id, amount_cents: amount, before_cents: invoice.allocated_cents }] : [];
  });
  const total = currentlyAllocated + changes.reduce((sum, change) => sum + change.amount_cents - change.before_cents, 0);
  return { changes, total, remaining: receiptAmount - total, invalid: invalid || total > receiptAmount || total < 0 };
}

export type AdjustmentFilter = "allocated" | "changed" | "all";

export function filterAdjustmentInvoices(invoices: AdjustmentInvoice[], amounts: Record<string, string>, filter: AdjustmentFilter, query: string) {
  const search = query.trim().toLowerCase();
  return invoices.filter((invoice) => {
    const next = parsePaymentCents(amounts[invoice.id] ?? "");
    const changed = next === null || next !== invoice.allocated_cents;
    return (filter === "all" || (filter === "allocated" ? invoice.allocated_cents > 0 : changed))
      && `${invoice.invoice_number} ${invoice.case.plate ?? ""} ${invoice.case.unit_number ?? ""}`.toLowerCase().includes(search);
  }).sort((a, b) => Number(b.allocated_cents > 0) - Number(a.allocated_cents > 0));
}

export function adjustmentFeedback(preview: ReturnType<typeof adjustmentPreview>) {
  if (preview.remaining < 0) return "调整金额超过收款总额";
  if (preview.invalid) return "请检查标红的账单金额";
  if (!preview.changes.length) return "尚未修改分配金额";
  return "";
}
