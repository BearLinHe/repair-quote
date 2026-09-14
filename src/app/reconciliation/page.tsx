"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Plus, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { PaymentAccount, receiptAllocationStatus } from "@/lib/reconciliation-view";
import { ContinuePaymentDialog } from "./continue-payment-dialog";
import { NewPaymentDialog } from "./new-payment-dialog";
import { CompanyPicker } from "./company-picker";

type Payment = {
  id: string; received_at: string; bill_to_company: string; amount_cents: number; allocated_cents: number;
  payment_method: string; reference_number: string | null; note: string | null; created_by_name: string;
  allocations: { id: string; amount_cents: number; invoice: { invoice_number: string } }[];
};
type ReconciliationData = {
  payments: Payment[]; bill_to_options: string[]; can_filter_accounts: boolean; can_write: boolean; accounts: PaymentAccount[];
};

export default function ReconciliationPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [billTo, setBillTo] = useState("");
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [newPayment, setNewPayment] = useState(false);
  const [continuingPaymentId, setContinuingPaymentId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const invalidDates = Boolean(start && end && start > end);

  useEffect(() => {
    const abort = new AbortController();
    setPage(1);
    if (invalidDates) { setLoading(false); setError("收款结束日期不能早于开始日期"); return () => abort.abort(); }
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (billTo) params.set("bill_to", billTo);
    if (account !== "all") params.set("account", account);
    void fetch(`/api/reconciliation?${params}`, { signal: abort.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "收款记录加载失败"));
      if (!abort.signal.aborted) setData(payload);
    }).catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "收款记录加载失败"); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [start, end, billTo, account, revision, invalidDates]);

  const payments = useMemo(() => (data?.payments ?? []).filter((payment) =>
    (!billTo || payment.bill_to_company.toLocaleLowerCase() === billTo.toLocaleLowerCase())
    && (status === "all" || receiptAllocationStatus(payment.amount_cents, payment.allocated_cents).key === status)), [data, billTo, status]);
  const totals = payments.reduce((sum, payment) => ({ amount: sum.amount + payment.amount_cents, allocated: sum.allocated + payment.allocated_cents }), { amount: 0, allocated: 0 });
  const pages = Math.max(1, Math.ceil(payments.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visiblePayments = payments.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const resetFilters = () => { setStart(""); setEnd(""); setBillTo(""); setAccount("all"); setStatus("all"); setPage(1); };
  const refresh = () => setRevision((current) => current + 1);
  const companies = [...new Set([...(data?.bill_to_options ?? []), ...(data?.payments ?? []).map((payment) => payment.bill_to_company)])];
  const extraFilterClass = mobileFiltersOpen ? "" : "hidden sm:block";
  const extraFilterCount = Number(Boolean(start || end)) + Number(status !== "all") + Number(account !== "all");

  return <div className="page-shell space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">收款与销账</h1>
      <Button onClick={() => { setNewPayment(true); setSuccess(""); }} disabled={!data?.can_write}><Plus className="size-4" />新增收款</Button>
    </header>
    {success && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />{success}</span><button type="button" aria-label="关闭提示" onClick={() => setSuccess("")}><X className="size-4" /></button></div>}
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}<Button variant="ghost" size="sm" disabled={invalidDates || loading} onClick={refresh}><RefreshCw className="size-4" />重试</Button></div>}

    <section className="surface-panel p-4 sm:p-5" aria-label="筛选收款记录">
      <div className={`grid gap-3 sm:grid-cols-2 ${data?.can_filter_accounts ? "xl:grid-cols-[minmax(220px,1fr)_170px_170px_150px_160px_auto]" : "xl:grid-cols-[minmax(220px,1fr)_180px_180px_170px_auto]"} xl:items-end`}>
        <div><div className="mb-1.5 flex items-center justify-between"><label htmlFor="filter-company" className="text-xs font-medium text-muted-foreground">Bill To</label><button type="button" className="inline-flex items-center gap-1 py-1 text-xs text-primary sm:hidden" aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)}><SlidersHorizontal className="size-3.5" />{mobileFiltersOpen ? "收起筛选" : `筛选${extraFilterCount ? ` (${extraFilterCount})` : ""}`}</button></div><CompanyPicker id="filter-company" value={billTo} onChange={setBillTo} options={companies} placeholder="全部公司" /></div>
        <div className={extraFilterClass}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">收款开始日期</span><DatePicker value={start} onChange={setStart} ariaLabel="收款开始日期" /></div>
        <div className={extraFilterClass}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">收款结束日期</span><DatePicker value={end} onChange={setEnd} ariaLabel="收款结束日期" /></div>
        <div className={extraFilterClass}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">分配状态</span><Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger aria-label="分配状态"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="unallocated">待分配</SelectItem><SelectItem value="partial">部分分配</SelectItem><SelectItem value="allocated">全部分配</SelectItem></SelectContent></Select></div>
        {data?.can_filter_accounts && <div className={extraFilterClass}><span className="mb-1.5 block text-xs font-medium text-muted-foreground">归属账号</span><Select value={account} onValueChange={(value) => { setAccount(value); setBillTo(""); }}><SelectTrigger aria-label="筛选归属账号"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem><SelectItem value="__ADMIN__">管理员（全局）</SelectItem>{data.accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}
        <Button className={extraFilterClass} variant="ghost" onClick={resetFilters} disabled={!start && !end && !billTo && account === "all" && status === "all"}>重置</Button>
      </div>
    </section>

    <section className="surface-panel overflow-hidden" aria-label="收款列表" aria-busy={loading}>
      <div className="grid grid-cols-3 divide-x border-b">
        {[["收款总额", totals.amount], ["已分配", totals.allocated], ["待分配", totals.amount - totals.allocated]].map(([label, value]) => <div key={label} className="min-w-0 px-3 py-4 sm:px-5"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 break-all text-sm font-semibold tabular-nums sm:text-lg ${label === "待分配" ? "text-primary" : ""}`}>{loading || error ? "—" : formatCents(Number(value))}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5"><span className="text-sm font-semibold">{loading ? "正在加载…" : `${payments.length} 笔收款`}</span><span className="text-xs text-muted-foreground">最近 200 笔 · 按收款日期倒序</span></div>
      {loading ? <p className="py-16 text-center text-sm text-muted-foreground">正在加载收款记录…</p> : error ? <p className="py-16 text-center text-sm text-muted-foreground">暂时无法展示，请检查筛选条件或重试</p> : !payments.length ? <div className="px-4 py-16 text-center"><p className="font-medium">暂无收款记录</p><p className="mt-2 text-sm text-muted-foreground">收到款项后，点击「新增收款」登记。</p></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[920px] text-sm"><thead className="border-b bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-5 py-3 text-left font-medium">收款日期 / 凭证</th><th className="px-4 py-3 text-left font-medium">Bill To</th><th className="px-4 py-3 text-right font-medium">收款金额</th><th className="px-4 py-3 text-right font-medium">已分配</th><th className="px-4 py-3 text-right font-medium">待分配</th><th className="px-4 py-3 text-left font-medium">状态</th><th className="px-5 py-3 text-right font-medium">操作</th></tr></thead><tbody className="divide-y">
          {visiblePayments.map((payment) => <Fragment key={payment.id}><tr className="transition-colors hover:bg-muted/20">
            <td className="px-5 py-4"><p className="tabular-nums">{new Date(payment.received_at).toLocaleDateString("zh-CN")}</p><p className="mt-1 text-xs text-muted-foreground">{payment.payment_method}{payment.reference_number && ` · ${payment.reference_number}`}</p></td>
            <td className="max-w-64 px-4 py-4"><p className="break-words font-semibold">{payment.bill_to_company}</p><p className="mt-1 text-xs text-muted-foreground">{payment.created_by_name}</p></td>
            <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{formatCents(payment.amount_cents)}</td><td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-muted-foreground">{formatCents(payment.allocated_cents)}</td><td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{formatCents(payment.amount_cents - payment.allocated_cents)}</td>
            <td className="px-4 py-4"><PaymentStatus payment={payment} /></td>
            <td className="px-5 py-4"><div className="flex items-center justify-end gap-2">{payment.amount_cents > payment.allocated_cents && <Button size="sm" variant="outline" disabled={!data?.can_write} onClick={() => setContinuingPaymentId(payment.id)}>继续销账<ArrowRight className="size-3.5" /></Button>}<Button variant="ghost" size="sm" aria-label={`${payment.bill_to_company} 收款明细`} aria-expanded={expanded === payment.id} onClick={() => setExpanded(expanded === payment.id ? null : payment.id)}><ChevronDown className={`size-4 transition-transform ${expanded === payment.id ? "rotate-180" : ""}`} /></Button></div></td>
          </tr>{expanded === payment.id && <tr><td colSpan={7} className="bg-muted/15 px-5 py-4"><PaymentDetails payment={payment} /></td></tr>}</Fragment>)}
        </tbody></table></div>
        <div className="divide-y md:hidden">{visiblePayments.map((payment) => <article key={payment.id} className="space-y-4 px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{payment.bill_to_company}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(payment.received_at).toLocaleDateString("zh-CN")} · {payment.payment_method}</p></div><PaymentStatus payment={payment} /></div><div className="grid grid-cols-3 gap-2">{[["收款", payment.amount_cents], ["已分配", payment.allocated_cents], ["待分配", payment.amount_cents - payment.allocated_cents]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums">{formatCents(Number(value))}</p></div>)}</div><div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="flex items-center gap-1 py-2 text-xs text-muted-foreground" aria-expanded={expanded === payment.id} onClick={() => setExpanded(expanded === payment.id ? null : payment.id)}>收款明细<ChevronDown className="size-3.5" /></button>{payment.amount_cents > payment.allocated_cents && <Button variant="outline" size="sm" disabled={!data?.can_write} onClick={() => setContinuingPaymentId(payment.id)}>继续销账<ArrowRight className="size-3.5" /></Button>}</div>{expanded === payment.id && <PaymentDetails payment={payment} />}</article>)}</div>
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>每页</span><Select value={String(pageSize)} onValueChange={(value) => { setPageSize(Number(value)); setPage(1); }}><SelectTrigger className="h-8 w-20 min-h-0" aria-label="每页收款条数"><SelectValue /></SelectTrigger><SelectContent>{[20, 50, 100, 200].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select><span>条</span></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{currentPage} / {pages} 页</span><Button size="sm" variant="outline" aria-label="上一页" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-4" /></Button><Button size="sm" variant="outline" aria-label="下一页" disabled={currentPage >= pages || loading} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-4" /></Button></div></div>
    </section>
    {data && !data.can_write && <p className="text-sm text-muted-foreground">当前账号为只读权限，不能登记收款或销账。</p>}
    {newPayment && data && <NewPaymentDialog accounts={data.accounts} admin={data.can_filter_accounts} onClose={() => setNewPayment(false)} onSaved={(message) => { setSuccess(message); resetFilters(); refresh(); }} />}
    {continuingPaymentId && <ContinuePaymentDialog key={continuingPaymentId} paymentId={continuingPaymentId} onClose={() => setContinuingPaymentId(null)} onSaved={refresh} />}
  </div>;
}

function PaymentStatus({ payment }: { payment: Payment }) {
  const status = receiptAllocationStatus(payment.amount_cents, payment.allocated_cents);
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${status.key === "allocated" ? "bg-primary/10 text-primary" : status.key === "partial" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{status.label}</span>;
}

function PaymentDetails({ payment }: { payment: Payment }) {
  return <div className="space-y-3 text-sm"><div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground"><span>登记账号：{payment.created_by_name}</span>{payment.reference_number && <span>支票 / 交易号：{payment.reference_number}</span>}{payment.note && <span className="break-words">备注：{payment.note}</span>}</div>{payment.allocations.length ? <div className="max-w-xl divide-y">{payment.allocations.map((allocation) => <div key={allocation.id} className="flex items-center justify-between gap-3 py-2"><span className="break-all font-mono text-xs">{allocation.invoice.invoice_number}</span><span className="font-medium tabular-nums">{formatCents(allocation.amount_cents)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">尚未分配到 Invoice</p>}</div>;
}
