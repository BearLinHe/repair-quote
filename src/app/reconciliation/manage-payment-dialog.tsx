"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, RefreshCw, Search, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { AdjustmentInvoice, adjustmentPreview } from "@/lib/payment-adjustment-view";
import { parsePaymentCents } from "@/lib/reconciliation-view";

export type PaymentManagementAction = "adjust" | "void" | "history";
type PaymentDetail = {
  payment: { id: string; bill_to_company: string; amount_cents: number; allocated_cents: number;
    remaining_cents: number; revision: number; received_at: string; payment_method: string; reference_number: string | null;
    voided_at: string | null; void_reason: string | null; voided_by_name: string | null };
  can_write: boolean;
  invoices: AdjustmentInvoice[];
  events: { id: string; created_at: string; actor_name: string; action: string; details: unknown }[];
};

export function ManagePaymentDialog({ paymentId, action, onClose, onSaved }: {
  paymentId: string; action: PaymentManagementAction; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const submitting = useRef(false);
  const requestVersion = useRef(0);
  const titles = { adjust: "调整销账", void: "作废收款", history: "收款操作记录" };

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/reconciliation/${paymentId}/adjustment`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(payload, "收款明细加载失败"));
      if (version !== requestVersion.current) return;
      setData(payload);
      setAmounts(Object.fromEntries((payload.invoices as AdjustmentInvoice[]).map((invoice) => [invoice.id, invoice.allocated_cents ? (invoice.allocated_cents / 100).toFixed(2) : ""])));
      setNeedsRefresh(false);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause.message : "收款明细加载失败"); setNeedsRefresh(true);
    } finally { if (version === requestVersion.current) setLoading(false); }
  }, [paymentId]);
  useEffect(() => { void load(); return () => { requestVersion.current += 1; }; }, [load]);

  const payment = data?.payment;
  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const preview = adjustmentPreview(invoices, amounts, payment?.amount_cents ?? 0, payment?.allocated_cents ?? 0);
  const visible = invoices.filter((invoice) => `${invoice.invoice_number} ${invoice.case.plate ?? ""} ${invoice.case.unit_number ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const hiddenChanges = preview.changes.filter((change) => !visible.some((invoice) => invoice.id === change.invoice_id)).length;
  const disabled = loading || saving || needsRefresh || !data?.can_write;
  const save = async () => {
    if (submitting.current || disabled || !payment || action === "history" || !reason.trim() || (action === "adjust" && (preview.invalid || !preview.changes.length))) return;
    submitting.current = true; setSaving(true); setError("");
    try {
      const response = await fetch(`/api/reconciliation/${paymentId}/adjustment`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim(), expected_revision: payment.revision,
          ...(action === "adjust" ? { allocations: preview.changes.map(({ invoice_id, amount_cents }) => ({ invoice_id, amount_cents })) } : {}) }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(apiErrorMessage(payload, "操作失败"));
        if (response.status === 409 || response.status >= 500) setNeedsRefresh(true);
        return;
      }
      onSaved(action === "void" ? "收款已作废，相关 Invoice 欠款已恢复，原记录和操作原因已保留。" : `销账已调整，当前待分配余额 ${formatCents(payload.remaining_cents)}。`);
      onClose();
    } catch {
      setNeedsRefresh(true); setError("未能确认操作结果，请先刷新并查看操作记录，避免重复提交。");
    } finally { submitting.current = false; setSaving(false); }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting.current) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-24px)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <div className="shrink-0 border-b px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3"><Dialog.Title className="text-lg font-bold">{titles[action]}</Dialog.Title><Button variant="ghost" size="sm" disabled={saving} aria-label="关闭收款管理窗口" onClick={onClose}><X className="size-4" /></Button></div>
          <Dialog.Description className="sr-only">调整会更新 Invoice 已付及欠款，作废不会删除原收款，所有操作都会留档。</Dialog.Description>
          {payment && <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><p className="break-words font-semibold">{payment.bill_to_company}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payment.received_at).toLocaleDateString("zh-CN")} · {payment.payment_method}{payment.reference_number && ` · ${payment.reference_number}`}</p></div>
            <div className="flex flex-wrap gap-5 text-sm">{[["原收款", payment.amount_cents], ["当前已分配", payment.allocated_cents], ["当前待分配", payment.remaining_cents]].map(([label, amount]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{formatCents(Number(amount))}</p></div>)}</div>
          </div>}
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {needsRefresh && <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => void load()}><RefreshCw className="size-4" />刷新记录</Button>}
          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">正在加载收款明细…</p> : data && payment && <>
            {payment.voided_at && <div className="rounded-xl border bg-muted/40 p-4 text-sm"><p className="font-semibold">此收款已作废</p><p className="mt-1">{payment.void_reason}</p><p className="mt-2 text-xs text-muted-foreground">{payment.voided_by_name} · {new Date(payment.voided_at).toLocaleString("zh-CN", { hour12: false })}</p></div>}
            {action === "adjust" && !payment.voided_at && <>
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">填写调整后的分配金额；填 0 撤回该张账单的分配。</p><Button variant="outline" size="sm" disabled={disabled || !payment.allocated_cents} onClick={() => { setAmounts({}); setError(""); }}><Undo2 className="size-4" />全部撤回</Button></div>
              <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索调整账单" className="pl-9" placeholder="Invoice / 车牌 / 车号" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              {hiddenChanges > 0 && <p className="text-sm text-primary">另有 {hiddenChanges} 张已修改账单被筛选隐藏，仍包含在本次调整中。<button type="button" className="ml-2 underline" onClick={() => setQuery("")}>显示全部</button></p>}
              <div className="overflow-hidden rounded-xl border">
                <div className="hidden grid-cols-[minmax(160px,1fr)_110px_110px_140px_120px] gap-3 border-b bg-muted/35 px-4 py-3 text-xs text-muted-foreground md:grid"><span>Invoice / 日期</span><span className="text-right">账单总额</span><span className="text-right">本收款原分配</span><span className="text-right">调整后分配</span><span className="text-right">调整后欠款</span></div>
                <div className="divide-y">{visible.map((invoice) => {
                  const next = parsePaymentCents(amounts[invoice.id] ?? "");
                  const invalid = next === null || next > invoice.max_allocation_cents;
                  const delta = (next ?? 0) - invoice.allocated_cents;
                  return <div key={invoice.id} className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-[minmax(160px,1fr)_110px_110px_140px_120px] md:items-center">
                    <div className="col-span-2 min-w-0 md:col-span-1"><p className="break-all font-mono text-xs font-semibold">{invoice.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")} · {invoice.case.plate || invoice.case.unit_number || "—"}</p></div>
                    <div className="text-sm md:text-right"><span className="mb-1 block text-xs text-muted-foreground md:hidden">账单总额</span>{formatCents(invoice.grand_total_cents)}</div>
                    <div className="text-sm md:text-right"><span className="mb-1 block text-xs text-muted-foreground md:hidden">本收款原分配</span>{formatCents(invoice.allocated_cents)}</div>
                    <div><label htmlFor={`adjust-${invoice.id}`} className="mb-1 block text-xs text-muted-foreground md:hidden">调整后分配</label><Input id={`adjust-${invoice.id}`} aria-label={`Invoice ${invoice.invoice_number} 调整后分配金额`} inputMode="decimal" disabled={disabled} className="text-right tabular-nums" aria-invalid={invalid} value={amounts[invoice.id] ?? ""} placeholder="0.00" onChange={(event) => { setAmounts((current) => ({ ...current, [invoice.id]: event.target.value })); setError(""); }} />{invalid ? <p className="mt-1 text-xs text-destructive">金额无效或超过可分配额</p> : delta !== 0 && <p className={`mt-1 text-right text-xs ${delta < 0 ? "text-amber-600" : "text-primary"}`}>{delta < 0 ? "撤回" : "增加"} {formatCents(Math.abs(delta))}</p>}</div>
                    <div className="text-right text-sm font-medium tabular-nums"><span className="mb-1 block text-xs font-normal text-muted-foreground md:hidden">调整后欠款</span>{invalid ? "—" : formatCents(Math.max(0, invoice.grand_total_cents - invoice.other_paid_cents - (next ?? 0)))}</div>
                  </div>;
                })}{!visible.length && <p className="p-8 text-center text-sm text-muted-foreground">没有匹配的 Invoice</p>}</div>
              </div>
            </>}
            {action === "void" && !payment.voided_at && <>
              <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" /><div><p className="font-semibold">将作废这笔 {formatCents(payment.amount_cents)} 收款</p><p className="mt-1 text-muted-foreground">撤回已分配的 {formatCents(payment.allocated_cents)} 并恢复对应账单欠款。原收款及操作记录保留，不影响其他收款。此操作不会发起银行退款。</p></div></div>
              <div className="divide-y rounded-xl border">{invoices.filter((invoice) => invoice.allocated_cents > 0).map((invoice) => <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span className="font-mono text-xs">{invoice.invoice_number}</span><span>撤回 {formatCents(invoice.allocated_cents)} · 欠款恢复至 {formatCents(Math.max(0, invoice.grand_total_cents - invoice.other_paid_cents))}</span></div>)}{!payment.allocated_cents && <p className="p-4 text-sm text-muted-foreground">此收款尚未分配，不会改变 Invoice 已付金额。</p>}</div>
            </>}
            {action !== "history" && !payment.voided_at && <div><label htmlFor="payment-change-reason" className="mb-2 block text-sm font-medium">{action === "void" ? "作废" : "调整"}原因 *</label><textarea id="payment-change-reason" required maxLength={1000} disabled={disabled} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "void" ? "例如：支票退票、重复登记" : "例如：分配错 Invoice，退回重新分配"} className="min-h-24 w-full resize-y rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" /></div>}
            {action === "history" && <PaymentHistory events={data.events} />}
          </>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t bg-muted/15 px-4 py-4 sm:px-6">
          {action === "adjust" && !payment?.voided_at ? <div aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span>调整后已分配 <b className="ml-1 tabular-nums">{formatCents(preview.total)}</b></span><span>调整后待分配 <b className={`ml-1 tabular-nums ${preview.remaining < 0 ? "text-destructive" : "text-primary"}`}>{formatCents(preview.remaining)}</b></span></div> : <span />}
          <div className="flex w-full justify-end gap-2 sm:w-auto"><Button variant="outline" disabled={saving} onClick={onClose}>关闭</Button>{action !== "history" && !payment?.voided_at && <Button variant={action === "void" ? "destructive" : "default"} disabled={disabled || !reason.trim() || (action === "adjust" && (preview.invalid || !preview.changes.length))} onClick={() => void save()}>{saving ? "正在保存…" : action === "void" ? "确认作废收款" : "确认调整"}</Button>}</div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function PaymentHistory({ events }: { events: PaymentDetail["events"] }) {
  const labels: Record<string, string> = { PAYMENT_RECONCILED: "登记收款", PAYMENT_ALLOCATION_ADDED: "继续销账", PAYMENT_ALLOCATION_ADJUSTED: "调整销账", PAYMENT_VOIDED: "作废收款" };
  return <div className="space-y-3">{events.map((event) => {
    const details = event.details && typeof event.details === "object" ? event.details as Record<string, unknown> : {};
    const changes = Array.isArray(details.changes) ? details.changes as { invoice_id: string; invoice_number: string; before_cents: number; after_cents: number }[] : [];
    return <article key={event.id} className="rounded-xl border p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{labels[event.action] ?? event.action}</p><time className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("zh-CN", { hour12: false })}</time></div><p className="mt-1 text-xs text-muted-foreground">操作账号：{event.actor_name}</p>{typeof details.reason === "string" && <p className="mt-3 break-words">原因：{details.reason}</p>}{typeof details.before_allocated_cents === "number" && typeof details.after_allocated_cents === "number" && <p className="mt-2 text-muted-foreground">已分配：{formatCents(details.before_allocated_cents)} → {formatCents(details.after_allocated_cents)}</p>}{typeof details.newly_allocated_cents === "number" && <p className="mt-2">本次分配：{formatCents(details.newly_allocated_cents)}</p>}{event.action === "PAYMENT_RECONCILED" && typeof details.amount_cents === "number" && <p className="mt-2">收款：{formatCents(details.amount_cents)}</p>}{changes.length > 0 && <div className="mt-3 divide-y border-t">{changes.map((change) => <div key={change.invoice_id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-mono text-xs">{change.invoice_number}</span><span className="tabular-nums">{formatCents(change.before_cents)} → {formatCents(change.after_cents)}</span></div>)}</div>}</article>;
  })}{!events.length && <p className="py-10 text-center text-sm text-muted-foreground">暂无操作记录</p>}</div>;
}
