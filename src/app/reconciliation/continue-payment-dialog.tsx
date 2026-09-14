"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, RefreshCw, Search, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";

type AllocationInvoice = {
  id: string;
  invoice_number: string;
  issued_at: string;
  grand_total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  case: { plate: string | null; unit_number: string | null };
};
type PaymentDetail = {
  payment: {
    id: string;
    bill_to_company: string;
    received_at: string;
    payment_method: string;
    reference_number: string | null;
    amount_cents: number;
    allocated_cents: number;
    remaining_cents: number;
  };
  invoices: AllocationInvoice[];
  can_write: boolean;
};

function parseCents(value: string) {
  const text = value.trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  const [dollars, decimals = ""] = text.split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function ContinuePaymentDialog({ paymentId, onClose, onSaved }: {
  paymentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const submitting = useRef(false);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reconciliation/${paymentId}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "收款余额加载失败"));
      if (version !== requestVersion.current) return;
      setData(payload);
      setAmounts({});
      setNeedsRefresh(false);
    } catch (loadError) {
      if (version !== requestVersion.current) return;
      setNeedsRefresh(true);
      setError(loadError instanceof Error ? loadError.message : "收款余额加载失败");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load]);

  const payment = data?.payment;
  const selected = (data?.invoices ?? []).flatMap((invoice) => {
    const amount = parseCents(amounts[invoice.id] ?? "");
    return amount && amount > 0 ? [{ invoice_id: invoice.id, amount_cents: amount }] : [];
  });
  const total = selected.reduce((sum, item) => sum + item.amount_cents, 0);
  const remaining = (payment?.remaining_cents ?? 0) - total;
  const hasInvalidAmount = (data?.invoices ?? []).some((invoice) => {
    const amount = parseCents(amounts[invoice.id] ?? "");
    return amount === null || amount > invoice.outstanding_cents;
  });
  const search = query.trim().toLowerCase();
  const visibleInvoices = (data?.invoices ?? []).filter((invoice) =>
    `${invoice.invoice_number} ${invoice.case.plate ?? ""} ${invoice.case.unit_number ?? ""}`.toLowerCase().includes(search),
  );
  const disabled = loading || saving || needsRefresh || !data?.can_write;

  const autoAllocate = () => {
    let available = payment?.remaining_cents ?? 0;
    const next: Record<string, string> = {};
    for (const invoice of visibleInvoices) {
      if (available <= 0) break;
      const cents = Math.min(available, invoice.outstanding_cents);
      next[invoice.id] = (cents / 100).toFixed(2);
      available -= cents;
    }
    setAmounts(next);
    setError("");
  };

  const save = async () => {
    if (submitting.current || disabled || !payment || !total || remaining < 0 || hasInvalidAmount) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/reconciliation/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_allocated_cents: payment.allocated_cents, allocations: selected }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 409 || response.status >= 500) setNeedsRefresh(true);
        throw new Error(apiErrorMessage(result, "销账失败，请刷新余额后重试"));
      }
      setSuccess(`本次已销账 ${formatCents(total)}，这笔收款剩余 ${formatCents(result.remaining_cents)}`);
      setAmounts({});
      onSaved();
      await load();
    } catch (saveError) {
      // Refresh before retrying an uncertain request to avoid recording it twice.
      setNeedsRefresh(true);
      setError(saveError instanceof Error ? saveError.message : "未能确认销账结果，请刷新余额");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting.current) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-24px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-bold">继续销账</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="sm" aria-label="关闭销账窗口" disabled={saving}><X className="size-4" /></Button></Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">使用已登记收款的余额，填写对应 Invoice 的本次抵扣金额。</Dialog.Description>
          {payment && <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold">{payment.bill_to_company}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payment.received_at).toLocaleDateString("zh-CN")} · {payment.payment_method}{payment.reference_number && ` · ${payment.reference_number}`}</p></div>
            <div className="flex gap-5 text-sm"><div><p className="text-xs text-muted-foreground">原收款金额</p><p className="mt-1 font-semibold tabular-nums">{formatCents(payment.amount_cents)}</p></div><div><p className="text-xs text-muted-foreground">已销账</p><p className="mt-1 font-semibold tabular-nums">{formatCents(payment.allocated_cents)}</p></div><div><p className="text-xs text-muted-foreground">可用余额</p><p className="mt-1 font-bold tabular-nums text-primary">{formatCents(payment.remaining_cents)}</p></div></div>
          </div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {success && <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary"><CheckCircle2 className="size-4 shrink-0" />{success}</div>}
          {needsRefresh && <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4" />刷新余额</Button>}
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">正在加载收款和未结清账单…</p> : data && <>
            {!data.can_write && <p className="mb-3 text-sm text-muted-foreground">当前账号为只读权限</p>}
            {payment?.remaining_cents === 0 ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-primary" /><p className="font-semibold">这笔收款已全部销账</p></div> : <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-semibold">未结清 Invoice · {data.invoices.length} 张</h3><p className="mt-1 text-xs text-muted-foreground">该公司全部日期的账单</p></div>
                <Button variant="outline" size="sm" disabled={disabled || !visibleInvoices.length} onClick={autoAllocate}><WandSparkles className="size-4" />按最早账单分配</Button>
              </div>
              <div className="relative mb-3"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索待销账 Invoice" placeholder="搜索 Invoice / 车牌 / 车号" className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              {!visibleInvoices.length ? <p className="py-8 text-center text-sm text-muted-foreground">{data.invoices.length ? "没有匹配的 Invoice" : "该公司暂无未结清 Invoice，余额可保留供以后使用"}</p> : <div className="divide-y rounded-xl border">
                <div className="hidden grid-cols-[minmax(150px,1fr)_100px_100px_100px_125px] gap-3 rounded-t-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground md:grid"><span>Invoice / 日期</span><span className="text-right">账单金额</span><span className="text-right">已付</span><span className="text-right">未付</span><span className="text-right">本次销账</span></div>
                {visibleInvoices.map((invoice) => {
                  const cents = parseCents(amounts[invoice.id] ?? "");
                  const invalid = cents === null || cents > invoice.outstanding_cents;
                  return <div key={invoice.id} className="grid grid-cols-3 gap-3 px-4 py-3 md:grid-cols-[minmax(150px,1fr)_100px_100px_100px_125px] md:items-center">
                    <div className="col-span-3 md:col-span-1"><p className="font-mono text-xs font-semibold">{invoice.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")} · {invoice.case.plate || invoice.case.unit_number || "—"}</p></div>
                    {[["账单", invoice.grand_total_cents], ["已付", invoice.paid_cents], ["未付", invoice.outstanding_cents]].map(([label, value]) => <div key={label} className="md:text-right"><p className="mb-1 text-xs text-muted-foreground md:hidden">{label}</p><span className="text-sm tabular-nums">{formatCents(Number(value))}</span></div>)}
                    <div className="col-span-3 md:col-span-1"><Input aria-label={`Invoice ${invoice.invoice_number} 本次销账金额`} aria-invalid={invalid} inputMode="decimal" className={`text-right tabular-nums ${invalid ? "border-destructive" : ""}`} value={amounts[invoice.id] ?? ""} placeholder="0.00" disabled={disabled} onChange={(event) => { setAmounts((current) => ({ ...current, [invoice.id]: event.target.value })); setSuccess(""); }} />{invalid && <p className="mt-1 text-xs text-destructive">{cents === null ? "请输入两位小数以内的金额" : "超过未付余额"}</p>}</div>
                  </div>;
                })}
              </div>}
            </>}
          </>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t bg-muted/15 px-4 py-4 sm:px-6">
          <div className="flex gap-5 text-sm"><div><span className="text-muted-foreground">本次销账</span><strong className="ml-2 tabular-nums">{formatCents(total)}</strong></div><div><span className="text-muted-foreground">销账后余额</span><strong className={`ml-2 tabular-nums ${remaining < 0 ? "text-destructive" : "text-primary"}`}>{formatCents(remaining)}</strong></div></div>
          <div className="flex gap-2"><Dialog.Close asChild><Button variant="outline" disabled={saving}>关闭</Button></Dialog.Close><Button onClick={() => void save()} disabled={disabled || !total || remaining < 0 || hasInvalidAmount}>{saving ? "正在销账…" : "确认销账"}</Button></div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
