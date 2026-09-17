"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { AllocationInvoice, allocationTotals } from "@/lib/reconciliation-view";
import { AllocationEditor } from "./allocation-editor";

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
    revision: number;
  };
  invoices: AllocationInvoice[];
  can_write: boolean;
};

export function ContinuePaymentDialog({ paymentId, onClose, onSaved }: {
  paymentId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
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
  const { selected, total, remaining, invalid: hasInvalidAmount } = allocationTotals(data?.invoices ?? [], amounts, payment?.remaining_cents ?? 0);
  const disabled = loading || saving || needsRefresh || !data?.can_write;
  const feedback = needsRefresh ? "请先刷新余额后重试" : !data?.can_write && !loading ? "当前账号为只读权限"
    : hasInvalidAmount ? "请检查标红的账单金额" : remaining < 0 ? "本次分配超过可用余额"
    : !total && payment?.remaining_cents ? "请填写需要销账的金额" : "";

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
        body: JSON.stringify({ expected_revision: payment.revision, expected_allocated_cents: payment.allocated_cents, allocations: selected }),
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
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-24px)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-bold">继续销账</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="sm" aria-label="关闭销账窗口" disabled={saving}><X className="size-4" /></Button></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">使用已登记收款的余额，填写对应 Invoice 的本次抵扣金额。</Dialog.Description>
          {payment && <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold">{payment.bill_to_company}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payment.received_at).toLocaleDateString("zh-CN")} · {payment.payment_method}{payment.reference_number && ` · ${payment.reference_number}`}</p></div>
            <div className="flex flex-wrap gap-5 text-sm"><div><p className="text-xs text-muted-foreground">原收款金额</p><p className="mt-1 font-semibold tabular-nums">{formatCents(payment.amount_cents)}</p></div><div><p className="text-xs text-muted-foreground">已分配</p><p className="mt-1 font-semibold tabular-nums">{formatCents(payment.allocated_cents)}</p></div><div><p className="text-xs text-muted-foreground">可分配余额</p><p className="mt-1 font-bold tabular-nums text-primary">{formatCents(payment.remaining_cents)}</p></div></div>
          </div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && <div role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {success && <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary"><CheckCircle2 className="size-4 shrink-0" />{success}</div>}
          {needsRefresh && <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4" />刷新余额</Button>}
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">正在加载收款和未结清账单…</p> : data && <>
            {!data.can_write && <p className="mb-3 text-sm text-muted-foreground">当前账号为只读权限</p>}
            {payment?.remaining_cents === 0 ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-primary" /><p className="font-semibold">这笔收款已全部销账</p></div> : <>
              <AllocationEditor invoices={data.invoices} amounts={amounts} onChange={(next) => { setAmounts(next); setSuccess(""); }} available={payment?.remaining_cents ?? 0} disabled={disabled} />
            </>}
          </>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t bg-muted/15 px-4 py-4 sm:px-6">
          <div aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><div><span className="text-muted-foreground">本次分配</span><strong className="ml-2 tabular-nums">{formatCents(total)}</strong></div><div><span className="text-muted-foreground">分配后剩余</span><strong className={`ml-2 tabular-nums ${remaining < 0 ? "text-destructive" : "text-primary"}`}>{formatCents(remaining)}</strong></div></div>
          <div className="w-full sm:w-auto">{feedback && <p id="continue-save-feedback" aria-live="polite" className={"mb-2 text-xs sm:text-right " + (hasInvalidAmount || remaining < 0 ? "text-destructive" : "text-muted-foreground")}>{feedback}</p>}<div className="flex justify-end gap-2"><Dialog.Close asChild><Button variant="outline" disabled={saving}>关闭</Button></Dialog.Close><Button className="flex-1 sm:flex-none" aria-describedby={feedback ? "continue-save-feedback" : undefined} onClick={() => void save()} disabled={disabled || !total || remaining < 0 || hasInvalidAmount}>{saving ? "正在销账…" : "确认销账"}</Button></div></div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
