"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, CheckCircle2, Clock3, ReceiptText, Search, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCents } from "@/lib/utils";
import { ContinuePaymentDialog } from "./continue-payment-dialog";

type OpenInvoice = {
  id: string;
  case_id: string;
  invoice_number: string;
  issued_at: string;
  clerk_user_id: string;
  grand_total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  payment_status: string;
  case: { bill_to_company: string | null; plate: string | null; unit_number: string | null; customer_name: string | null };
};

type Payment = {
  id: string;
  received_at: string;
  bill_to_company: string;
  amount_cents: number;
  allocated_cents: number;
  payment_method: string;
  reference_number: string | null;
  note: string | null;
  created_by_name: string;
  allocations: { id: string; amount_cents: number; invoice: { invoice_number: string } }[];
};

type ReconciliationData = {
  invoices: OpenInvoice[];
  payments: Payment[];
  summary: {
    invoice_count: number;
    open_invoice_count: number;
    receivable_cents: number;
    received_cents: number;
    outstanding_cents: number;
    unapplied_cents: number;
  };
  bill_to_options: string[];
  can_filter_accounts: boolean;
  accounts: { id: string; name: string; login: string }[];
};

const todayString = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const yearStartString = () => `${new Date().getFullYear()}-01-01`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "操作失败"));
  return data as T;
}

function dollarsToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export default function ReconciliationPage() {
  const [start, setStart] = useState(yearStartString());
  const [end, setEnd] = useState(todayString());
  const [billTo, setBillTo] = useState("");
  const [billToOpen, setBillToOpen] = useState(false);
  const [account, setAccount] = useState("all");
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayString());
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [continuingPaymentId, setContinuingPaymentId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ start, end });
    if (billTo.trim()) params.set("bill_to", billTo.trim());
    if (account !== "all") params.set("account", account);
    try {
      setData(await json<ReconciliationData>(`/api/reconciliation?${params}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "销账数据加载失败");
    } finally {
      setLoading(false);
    }
  }, [account, billTo, end, start]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), billTo.trim() ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const matchingBillTo = useMemo(() => {
    const query = billTo.trim().toLocaleLowerCase();
    return (data?.bill_to_options ?? []).filter((company) => !query || company.toLocaleLowerCase().includes(query));
  }, [billTo, data?.bill_to_options]);
  const exactBillTo = useMemo(
    () => (data?.bill_to_options ?? []).find((company) => company.toLocaleLowerCase() === billTo.trim().toLocaleLowerCase()) ?? "",
    [billTo, data?.bill_to_options],
  );
  const visibleInvoices = useMemo(
    () => (data?.invoices ?? []).filter((invoice) => !exactBillTo || invoice.case.bill_to_company?.toLocaleLowerCase() === exactBillTo.toLocaleLowerCase()),
    [data?.invoices, exactBillTo],
  );
  const paymentCents = dollarsToCents(amount) ?? 0;
  const allocatedCents = visibleInvoices.reduce((sum, invoice) => sum + (dollarsToCents(allocations[invoice.id] ?? "") ?? 0), 0);
  const remainingCents = paymentCents - allocatedCents;

  const chooseBillTo = (company: string) => {
    setBillTo(company);
    setBillToOpen(false);
    setAllocations({});
    setSuccess("");
  };

  const autoAllocate = () => {
    if (paymentCents <= 0) {
      setError("请先填写本次收款金额");
      return;
    }
    let remaining = paymentCents;
    const next: Record<string, string> = {};
    for (const invoice of visibleInvoices) {
      if (remaining <= 0) break;
      const cents = Math.min(remaining, invoice.outstanding_cents);
      next[invoice.id] = (cents / 100).toFixed(2);
      remaining -= cents;
    }
    setAllocations(next);
    setError("");
  };

  const save = async () => {
    setError("");
    setSuccess("");
    if (!exactBillTo) return setError("请从 Bill To 列表选择公司");
    if (paymentCents <= 0) return setError("请输入正确的收款金额");
    if (!paymentMethod.trim()) return setError("请填写付款方式");
    if (allocatedCents > paymentCents) return setError("已分配金额不能超过收款金额");
    const selected = visibleInvoices.flatMap((invoice) => {
      const cents = dollarsToCents(allocations[invoice.id] ?? "") ?? 0;
      return cents > 0 ? [{ invoice_id: invoice.id, amount_cents: cents }] : [];
    });
    setSaving(true);
    try {
      await json("/api/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_to_company: exactBillTo,
          received_at: receivedAt,
          amount_cents: paymentCents,
          payment_method: paymentMethod.trim(),
          reference_number: referenceNumber.trim() || null,
          note: note.trim() || null,
          account: account === "all" ? null : account,
          allocations: selected,
        }),
      });
      setSuccess(`已记录 ${formatCents(paymentCents)}，本次销账 ${formatCents(allocatedCents)}`);
      setAmount("");
      setPaymentMethod("");
      setReferenceNumber("");
      setNote("");
      setAllocations({});
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存销账失败");
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-shell space-y-6">
    <section className="hero-panel compact-hero">
      <p className="section-eyebrow">Accounts Receivable</p>
      <h1 className="page-title">财务销账</h1>
      <p className="page-subtitle">登记客户收款，并将金额分配到对应 Invoice。</p>
    </section>

    <section className="surface-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[170px_170px_minmax(260px,1fr)_220px] lg:p-5">
      <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">开始日期</label><DatePicker value={start} onChange={setStart} /></div>
      <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">结束日期</label><DatePicker value={end} onChange={setEnd} /></div>
      <div className="relative"><label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill To</label><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={billTo} onChange={(event) => { setBillTo(event.target.value); setBillToOpen(true); setAllocations({}); }} onFocus={() => setBillToOpen(true)} onBlur={() => window.setTimeout(() => setBillToOpen(false), 120)} placeholder="搜索并选择公司" /></div>{billToOpen && <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-xl">{matchingBillTo.map((company) => <button key={company} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseBillTo(company)} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">{company}</button>)}{matchingBillTo.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">没有匹配的 Bill To</p>}</div>}</div>
      {data?.can_filter_accounts && <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">业务账号</label><Select value={account} onValueChange={(value) => { setAccount(value); setAllocations({}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem>{data.accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>}
    </section>

    {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    {success && <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="size-4" />{success}</div>}

    {data && <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard label="筛选账单" value={`${data.summary.invoice_count} 张`} icon={<ReceiptText />} />
      <SummaryCard label="应收金额" value={formatCents(data.summary.receivable_cents)} icon={<Banknote />} />
      <SummaryCard label="未结清" value={formatCents(data.summary.outstanding_cents)} accent icon={<Clock3 />} />
      <SummaryCard label="客户未分配余额" value={formatCents(data.summary.unapplied_cents)} icon={<ArrowRight />} />
    </section>}

    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,.55fr)]">
      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-5"><div><h2 className="font-bold">待销账 Invoice</h2><p className="mt-0.5 text-xs text-muted-foreground">{exactBillTo ? `${exactBillTo} · ${visibleInvoices.length} 张未结清` : "请先选择 Bill To"}</p></div><Button variant="outline" size="sm" onClick={autoAllocate} disabled={!exactBillTo || visibleInvoices.length === 0}><WandSparkles className="size-4" />按最早账单自动分配</Button></div>
        <div className="hidden grid-cols-[minmax(160px,1.1fr)_110px_110px_110px_140px] gap-3 border-b bg-muted/35 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid"><span>Invoice</span><span>账单金额</span><span>已付</span><span>未付</span><span>本次销账</span></div>
        <div className="divide-y">
          {loading && <p className="p-8 text-center text-sm text-muted-foreground">正在加载…</p>}
          {!loading && exactBillTo && visibleInvoices.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">该公司目前没有未结清 Invoice</p>}
          {!loading && !exactBillTo && <p className="p-8 text-center text-sm text-muted-foreground">选择 Bill To 后开始分配收款</p>}
          {!loading && exactBillTo && visibleInvoices.map((invoice) => {
            const allocation = dollarsToCents(allocations[invoice.id] ?? "") ?? 0;
            const invalid = allocation > invoice.outstanding_cents;
            return <div key={invoice.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(160px,1.1fr)_110px_110px_110px_140px] md:items-center md:px-5">
              <div><Link href={`/cases/${invoice.case_id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{invoice.invoice_number}</Link><p className="mt-1 text-xs text-muted-foreground">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")} · {invoice.case.plate ?? invoice.case.unit_number ?? "无车辆编号"}</p></div>
              <MoneyDatum label="账单" value={invoice.grand_total_cents} />
              <MoneyDatum label="已付" value={invoice.paid_cents} muted />
              <MoneyDatum label="未付" value={invoice.outstanding_cents} strong />
              <div><label className="mb-1 block text-xs text-muted-foreground md:hidden">本次销账</label><Input inputMode="decimal" value={allocations[invoice.id] ?? ""} onChange={(event) => setAllocations((current) => ({ ...current, [invoice.id]: event.target.value }))} placeholder="0.00" className={invalid ? "border-destructive" : ""} />{invalid && <p className="mt-1 text-[11px] text-destructive">不能超过未付余额</p>}</div>
            </div>;
          })}
        </div>
      </div>

      <aside className="surface-panel p-4 xl:sticky xl:top-24 xl:p-5">
        <h2 className="font-bold">登记本次收款</h2>
        <div className="mt-4 space-y-4">
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款金额 USD *</label><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">收款日期 *</label><DatePicker value={receivedAt} onChange={setReceivedAt} /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">付款方式 *</label><Input value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} placeholder="例如 Check、ACH、Cash" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">支票号 / 交易号</label><Input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="选填" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">备注</label><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="选填" /></div>
        </div>
        <div className="mt-5 divide-y rounded-xl border bg-muted/20 px-4">
          <AmountRow label="收款金额" value={paymentCents} />
          <AmountRow label="已分配" value={allocatedCents} />
          <AmountRow label={remainingCents >= 0 ? "尚未分配" : "超出收款"} value={Math.abs(remainingCents)} danger={remainingCents < 0} />
        </div>
        <Button className="mt-4 w-full" onClick={save} disabled={saving || !exactBillTo || paymentCents <= 0 || remainingCents < 0}>{saving ? "正在保存…" : "确认收款并销账"}</Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">未分配金额将保留为该客户余额</p>
      </aside>
    </section>

    <section className="surface-panel overflow-hidden">
      <div className="border-b px-4 py-4 sm:px-5"><h2 className="font-bold">收款与销账记录</h2><p className="mt-0.5 text-xs text-muted-foreground">尚有余额的收款可继续销账 · 最近 200 笔</p></div>
      <div className="divide-y">
        {(data?.payments ?? []).map((payment) => <div key={payment.id} className="grid gap-3 px-4 py-4 md:grid-cols-[130px_minmax(180px,1fr)_130px_minmax(220px,1fr)_140px] md:items-center md:px-5">
          <div><p className="font-semibold tabular-nums">{new Date(payment.received_at).toLocaleDateString("zh-CN")}</p><p className="text-xs text-muted-foreground">{payment.created_by_name}</p></div>
          <div><p className="font-semibold">{payment.bill_to_company}</p><p className="text-xs text-muted-foreground">{payment.payment_method}{payment.reference_number ? ` · ${payment.reference_number}` : ""}</p></div>
          <div><p className="text-lg font-bold tabular-nums">{formatCents(payment.amount_cents)}</p>{payment.amount_cents > payment.allocated_cents && <p className="text-xs text-amber-700">未分配 {formatCents(payment.amount_cents - payment.allocated_cents)}</p>}</div>
          <div className="flex flex-wrap gap-1.5">{payment.allocations.length ? payment.allocations.map((allocation) => <span key={allocation.id} className="rounded-md bg-muted px-2 py-1 text-xs"><span className="font-mono">{allocation.invoice.invoice_number}</span> · {formatCents(allocation.amount_cents)}</span>) : <span className="text-xs text-muted-foreground">暂未分配 Invoice</span>}</div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            {payment.amount_cents > payment.allocated_cents
              ? <Button size="sm" variant="outline" onClick={() => setContinuingPaymentId(payment.id)}>继续销账<ArrowRight className="size-4" /></Button>
              : <span className="inline-flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="size-3.5" />已全部销账</span>}
            {payment.note && <p className="text-xs text-muted-foreground md:text-right">{payment.note}</p>}
          </div>
        </div>)}
        {!loading && (data?.payments.length ?? 0) === 0 && <p className="p-8 text-center text-sm text-muted-foreground">当前条件下没有销账记录</p>}
      </div>
    </section>
    {continuingPaymentId && <ContinuePaymentDialog key={continuingPaymentId} paymentId={continuingPaymentId} onClose={() => setContinuingPaymentId(null)} onSaved={() => { setAllocations({}); void load(); }} />}
  </div>;
}

function SummaryCard({ label, value, icon, accent = false }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return <div className="surface-panel flex items-center gap-3 p-4"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${accent ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>{icon}</span><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-lg font-bold tabular-nums sm:text-xl">{value}</p></div></div>;
}

function MoneyDatum({ label, value, muted = false, strong = false }: { label: string; value: number; muted?: boolean; strong?: boolean }) {
  return <div className="flex items-center justify-between md:block"><span className="text-xs text-muted-foreground md:hidden">{label}</span><span className={`${strong ? "font-bold" : "font-medium"} ${muted ? "text-muted-foreground" : ""} tabular-nums`}>{formatCents(value)}</span></div>;
}

function AmountRow({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="flex items-center justify-between py-3 text-sm"><span className="text-muted-foreground">{label}</span><strong className={`${danger ? "text-destructive" : ""} tabular-nums`}>{formatCents(value)}</strong></div>;
}
