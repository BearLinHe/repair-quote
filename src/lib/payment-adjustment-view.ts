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
