export type AllocationInvoice = {
  id: string;
  invoice_number: string;
  issued_at: string;
  grand_total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  case: { bill_to_company?: string | null; plate: string | null; unit_number: string | null };
};

export type PaymentAccount = { id: string; name: string; login: string };

export function parsePaymentCents(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  const [dollars, decimals = ""] = text.split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= 2147483647 ? cents : null;
}

export function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function filterAllocationInvoices(invoices: AllocationInvoice[], query: string, start: string, end: string) {
  const search = query.trim().toLocaleLowerCase();
  return invoices.filter((invoice) => {
    const date = localDateValue(new Date(invoice.issued_at));
    return (!start || date >= start) && (!end || date <= end)
      && `${invoice.invoice_number} ${invoice.case.plate ?? ""} ${invoice.case.unit_number ?? ""}`.toLocaleLowerCase().includes(search);
  }).sort((a, b) => new Date(a.issued_at).getTime() - new Date(b.issued_at).getTime() || a.id.localeCompare(b.id));
}

export function allocationTotals(invoices: AllocationInvoice[], amounts: Record<string, string>, available: number) {
  let invalid = false;
  const selected = invoices.flatMap((invoice) => {
    const cents = parsePaymentCents(amounts[invoice.id] ?? "");
    if (cents === null || cents > invoice.outstanding_cents) invalid = true;
    return cents && cents > 0 ? [{ invoice_id: invoice.id, amount_cents: cents }] : [];
  });
  const total = selected.reduce((sum, item) => sum + item.amount_cents, 0);
  return { selected, total, remaining: available - total, invalid };
}

// Filtering never drops allocations already entered on hidden invoices.
export function allocateVisibleInvoices(invoices: AllocationInvoice[], visible: AllocationInvoice[], amounts: Record<string, string>, available: number) {
  const visibleIds = new Set(visible.map((invoice) => invoice.id));
  const next = Object.fromEntries(Object.entries(amounts).filter(([id]) => !visibleIds.has(id)));
  let remaining = Math.max(0, available - allocationTotals(invoices, next, available).total);
  for (const invoice of visible) {
    const cents = Math.min(remaining, invoice.outstanding_cents);
    next[invoice.id] = cents > 0 ? (cents / 100).toFixed(2) : "";
    remaining -= cents;
  }
  return next;
}

export function receiptAllocationStatus(amount: number, allocated: number, voided = false) {
  if (voided) return { key: "voided", label: "已作废" };
  if (allocated <= 0) return { key: "unallocated", label: "待分配" };
  if (allocated < amount) return { key: "partial", label: "部分分配" };
  return { key: "allocated", label: "全部分配" };
}
