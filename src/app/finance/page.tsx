"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";

type Overview = {
  net_revenue_cents: number;
  parts_revenue_cents: number;
  labor_revenue_cents: number;
  misc_revenue_cents: number;
  labor_hours: number;
  tax_collected_cents: number;
  invoice_total_cents: number;
  invoice_count: number;
};

type Invoice = {
  id: string;
  case_id: string;
  invoice_number: string;
  issued_at: string;
  clerk_user_id: string;
  owner_name: string;
  parts_revenue_cents: number;
  labor_revenue_cents: number;
  cleaning_fee_cents: number;
  tax_cents: number;
  grand_total_cents: number;
  payment_status: string;
  case: {
    plate: string | null;
    vin: string | null;
    unit_number: string | null;
    customer_name: string | null;
    bill_to_company: string | null;
  };
};

type AccountOption = { id: string; name: string; login: string };
type InvoiceResponse = { invoices: Invoice[]; can_filter_accounts: boolean; accounts: AccountOption[]; bill_to_options: string[] };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "加载失败"));
  return data as T;
}

const paymentLabel = (value: string) => ({
  UNPAID: "未付款",
  PARTIAL: "部分付款",
  PAID: "已付款",
  VOID: "已作废",
})[value] ?? value;

export default function FinancePage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [start, setStart] = useState(localDate(first));
  const [end, setEnd] = useState(localDate(today));
  const [billTo, setBillTo] = useState("");
  const [billToOpen, setBillToOpen] = useState(false);
  const [account, setAccount] = useState("all");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [billToOptions, setBillToOptions] = useState<string[]>([]);
  const [canFilterAccounts, setCanFilterAccounts] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ start, end });
    if (billTo.trim()) params.set("bill_to", billTo.trim());
    if (account !== "all") params.set("account", account);
    try {
      const [report, invoiceData] = await Promise.all([
        json<Overview>(`/api/reports/overview?${params}`),
        json<InvoiceResponse>(`/api/invoices?${params}`),
      ]);
      setOverview(report);
      setInvoices(invoiceData.invoices);
      setAccounts(invoiceData.accounts);
      setBillToOptions(invoiceData.bill_to_options);
      setCanFilterAccounts(invoiceData.can_filter_accounts);
      const availableIds = new Set(invoiceData.invoices.map((invoice) => invoice.id));
      setSelectedInvoiceIds((current) => new Set([...current].filter((id) => availableIds.has(id))));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "经营数据加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePayment = async (id: string, payment_status: string) => {
    try {
      await json("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, payment_status }),
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新失败");
    }
  };

  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = invoices.length > 0 && selectedInvoiceIds.size === invoices.length;
  const toggleAllInvoices = () => setSelectedInvoiceIds(allSelected ? new Set() : new Set(invoices.map((invoice) => invoice.id)));

  const exportSelectedInvoices = async () => {
    if (selectedInvoiceIds.size === 0 || exporting) return;
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/invoices/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedInvoiceIds] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(apiErrorMessage(data, "导出失败"));
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "invoice-export.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  const summary = overview ? [
    ["Invoice", String(overview.invoice_count)],
    ["账单总额", formatCents(overview.invoice_total_cents)],
    ["税前收入", formatCents(overview.net_revenue_cents)],
    ["代收税费", formatCents(overview.tax_collected_cents)],
  ] : [];
  const matchingBillToOptions = billToOptions.filter((company) => company.toLocaleLowerCase().includes(billTo.trim().toLocaleLowerCase()));

  return (
    <div className="page-shell space-y-5">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">经营分析</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Invoice 收入</h1>
        </div>
        <p className="text-sm text-muted-foreground">按开票日期统计</p>
      </header>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <section className="surface-panel p-4">
        <div className={`grid gap-3 ${canFilterAccounts ? "md:grid-cols-2 xl:grid-cols-[180px_180px_1fr_240px_auto]" : "md:grid-cols-2 xl:grid-cols-[180px_180px_1fr_auto]"}`}>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">开始日期</label><DatePicker value={start} onChange={setStart} ariaLabel="选择开始日期" /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">结束日期</label><DatePicker value={end} onChange={setEnd} ariaLabel="选择结束日期" /></div>
          <div className="relative"><label className="mb-1.5 block text-xs font-medium text-muted-foreground">Bill To</label><Input value={billTo} onChange={(event) => { setBillTo(event.target.value); setBillToOpen(true); }} onFocus={() => setBillToOpen(true)} onBlur={() => window.setTimeout(() => setBillToOpen(false), 120)} onKeyDown={(event) => event.key === "Enter" && void load()} placeholder="搜索或选择公司" role="combobox" aria-expanded={billToOpen} />{billToOpen && <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"><button type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { setBillTo(""); setBillToOpen(false); }}>全部 Bill To</button>{matchingBillToOptions.map((company) => <button key={company} type="button" className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => { setBillTo(company); setBillToOpen(false); }}>{company}</button>)}{matchingBillToOptions.length === 0 && billTo.trim() && <p className="px-3 py-2 text-sm text-muted-foreground">没有匹配项，将按输入内容搜索</p>}</div>}</div>
          {canFilterAccounts && <div><label className="mb-1.5 block text-xs font-medium text-muted-foreground">操作账号</label><Select value={account} onValueChange={setAccount}><SelectTrigger><SelectValue placeholder="全部账号" /></SelectTrigger><SelectContent><SelectItem value="all">全部账号</SelectItem>{accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.login}</SelectItem>)}</SelectContent></Select></div>}
          <Button className="self-end" onClick={() => void load()} disabled={loading}><Search className="size-4" />{loading ? "查询中" : "查询"}</Button>
        </div>
      </section>

      {overview && (
        <section className="surface-panel overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-y border-b md:grid-cols-4 md:divide-y-0">
            {summary.map(([label, value]) => <div key={label} className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p></div>)}
          </div>
          <div className="grid gap-x-8 gap-y-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <RevenueItem label="零件收入" value={formatCents(overview.parts_revenue_cents)} />
            <RevenueItem label="人工收入" value={formatCents(overview.labor_revenue_cents)} />
            <RevenueItem label="杂费收入" value={formatCents(overview.misc_revenue_cents)} />
            <RevenueItem label="人工工时" value={`${overview.labor_hours.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 小时`} icon />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-bold">Invoice 明细</h2><p className="mt-0.5 text-xs text-muted-foreground">当前筛选结果 {invoices.length} 条</p></div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleAllInvoices} disabled={invoices.length === 0}>{allSelected ? "取消全选" : "全选"}</Button>
            <Button size="sm" onClick={exportSelectedInvoices} disabled={selectedInvoiceIds.size === 0 || exporting}><Download className="size-4" />{exporting ? "正在导出" : `导出已选 ${selectedInvoiceIds.size}`}</Button>
          </div>
        </div>

        {!loading && invoices.length === 0 && <div className="surface-panel p-10 text-center text-sm text-muted-foreground">没有符合条件的 Invoice</div>}

        <div className="space-y-3 md:hidden">
          {invoices.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} checked={selectedInvoiceIds.has(invoice.id)} onToggle={() => toggleInvoice(invoice.id)} onPayment={updatePayment} />)}
        </div>

        {invoices.length > 0 && <div className="surface-panel hidden overflow-x-auto md:block">
          <table className="data-table w-full min-w-[1080px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left"><th className="w-12 p-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAllInvoices} aria-label="全选 Invoice" className="size-4 accent-primary" /></th><th className="p-3">Invoice</th><th className="p-3">Bill To</th><th className="p-3">操作账号</th><th className="p-3">日期</th><th className="p-3">收入构成</th><th className="p-3 text-right">账单总额</th><th className="p-3">付款状态</th><th className="p-3" /></tr></thead>
            <tbody>{invoices.map((invoice) => <tr key={invoice.id} className={`border-b last:border-0 ${selectedInvoiceIds.has(invoice.id) ? "bg-primary/[0.04]" : ""}`}><td className="p-3 text-center"><input type="checkbox" checked={selectedInvoiceIds.has(invoice.id)} onChange={() => toggleInvoice(invoice.id)} aria-label={`选择 Invoice ${invoice.invoice_number}`} className="size-4 accent-primary" /></td><td className="p-3"><p className="font-mono text-xs font-medium">{invoice.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{invoice.case.plate ?? invoice.case.vin ?? invoice.case.unit_number ?? "-"}</p></td><td className="p-3"><p className="font-medium">{invoice.case.bill_to_company ?? "-"}</p><p className="mt-1 text-xs text-muted-foreground">{invoice.case.customer_name ?? "-"}</p></td><td className="p-3">{invoice.owner_name}</td><td className="p-3 tabular-nums">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")}</td><td className="p-3"><p className="tabular-nums">零件 {formatCents(invoice.parts_revenue_cents)} · 人工 {formatCents(invoice.labor_revenue_cents)}</p>{invoice.cleaning_fee_cents > 0 && <p className="mt-1 text-xs text-muted-foreground">杂费 {formatCents(invoice.cleaning_fee_cents)}</p>}</td><td className="p-3 text-right text-base font-bold tabular-nums">{formatCents(invoice.grand_total_cents)}</td><td className="p-3"><PaymentSelect value={invoice.payment_status} onChange={(value) => updatePayment(invoice.id, value)} /></td><td className="p-3"><Link className="font-medium text-primary hover:underline" href={`/cases/${invoice.case_id}`}>详情</Link></td></tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>
  );
}

function RevenueItem({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0 sm:border-0 sm:pb-0"><span className="flex items-center gap-2 text-sm text-muted-foreground">{icon && <Clock3 className="size-4 text-primary" />}{label}</span><strong className="tabular-nums">{value}</strong></div>;
}

function PaymentSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-28"><SelectValue>{paymentLabel(value)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="UNPAID">未付款</SelectItem><SelectItem value="PARTIAL">部分付款</SelectItem><SelectItem value="PAID">已付款</SelectItem><SelectItem value="VOID">已作废</SelectItem></SelectContent></Select>;
}

function InvoiceCard({ invoice, checked, onToggle, onPayment }: { invoice: Invoice; checked: boolean; onToggle: () => void; onPayment: (id: string, status: string) => void }) {
  return <article className={`surface-panel p-4 ${checked ? "ring-1 ring-primary/30" : ""}`}><div className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`选择 Invoice ${invoice.invoice_number}`} className="mt-1 size-5 shrink-0 accent-primary" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-xs font-medium text-primary">{invoice.invoice_number}</p><p className="mt-1 truncate font-semibold">{invoice.case.bill_to_company ?? "未填写 Bill To"}</p><p className="text-xs text-muted-foreground">{invoice.owner_name} · {new Date(invoice.issued_at).toLocaleDateString("zh-CN")}</p></div><p className="shrink-0 text-lg font-bold tabular-nums">{formatCents(invoice.grand_total_cents)}</p></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-y py-3 text-xs text-muted-foreground"><span>零件 <b className="text-foreground">{formatCents(invoice.parts_revenue_cents)}</b></span><span>人工 <b className="text-foreground">{formatCents(invoice.labor_revenue_cents)}</b></span><span>杂费 <b className="text-foreground">{formatCents(invoice.cleaning_fee_cents)}</b></span></div><div className="mt-3 flex items-center justify-between gap-2"><PaymentSelect value={invoice.payment_status} onChange={(value) => onPayment(invoice.id, value)} /><Link className="inline-flex min-h-10 items-center rounded-lg border px-4 font-medium text-primary" href={`/cases/${invoice.case_id}`}>详情</Link></div></div></div></article>;
}
