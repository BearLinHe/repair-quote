"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Boxes, CircleDollarSign, Clock3, Download, ReceiptText, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";

type Overview = {
  purchase_spend_cents: number; purchase_count: number; net_revenue_cents: number;
  parts_revenue_cents: number; labor_revenue_cents: number; misc_revenue_cents: number; labor_hours: number;
  tax_collected_cents: number; invoice_total_cents: number; invoice_count: number;
  parts_cost_cents: number; gross_profit_cents: number; cash_difference_cents: number;
  inventory_value_cents: number; reserved_units: number; low_stock_count: number;
};

type Invoice = {
  id: string; case_id: string; invoice_number: string; issued_at: string;
  parts_revenue_cents: number; labor_revenue_cents: number; cleaning_fee_cents: number;
  tax_cents: number; grand_total_cents: number; parts_cost_cents: number; payment_status: string;
  case: { plate: string | null; vin: string | null; unit_number: string | null; customer_name: string | null };
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "加载失败"));
  return data as T;
}

export default function FinancePage() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const local = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [start, setStart] = useState(local(first));
  const [end, setEnd] = useState(local(today));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [report, invoiceData] = await Promise.all([
        json<Overview>(`/api/reports/overview?start=${start}&end=${end}`),
        json<{ invoices: Invoice[] }>("/api/invoices"),
      ]);
      setOverview(report);
      setInvoices(invoiceData.invoices);
      const availableIds = new Set(invoiceData.invoices.map((invoice) => invoice.id));
      setSelectedInvoiceIds((current) => new Set([...current].filter((id) => availableIds.has(id))));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "经营数据加载失败");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payment = (value: string) => ({ UNPAID: "未付款", PARTIAL: "部分付款", PAID: "已付款", VOID: "已作废" })[value] ?? value;
  const updatePayment = async (id: string, payment_status: string) => {
    try {
      await json("/api/invoices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, payment_status }) });
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
  const toggleAllInvoices = () => {
    setSelectedInvoiceIds(allSelected ? new Set() : new Set(invoices.map((invoice) => invoice.id)));
  };

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

  return (
    <div className="page-shell space-y-6">
      <div className="page-hero">
        <p className="section-eyebrow">维修部经营</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">收入与成本分析</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">采购支出反映现金流，配件消耗成本用于计算经营毛利，两者分开统计。</p>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="surface-panel flex flex-wrap items-end gap-3 p-4">
        <div className="w-full sm:w-48"><label className="mb-1 block text-xs font-medium text-muted-foreground">开始日期</label><DatePicker value={start} onChange={setStart} ariaLabel="选择开始日期" /></div>
        <div className="w-full sm:w-48"><label className="mb-1 block text-xs font-medium text-muted-foreground">结束日期</label><DatePicker value={end} onChange={setEnd} ariaLabel="选择结束日期" /></div>
        <Button onClick={load}>更新统计</Button>
      </div>
      {overview && (
        <div className="space-y-5">
          <section className="surface-panel p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-300"><CircleDollarSign className="size-5" /></span>
              <div><h2 className="font-bold">收入分析</h2><p className="text-xs text-muted-foreground">已完成并生成的 Invoice，按收入来源分别统计</p></div>
            </div>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              {[
                ["税前总收入", overview.net_revenue_cents, `${overview.invoice_count} 张 Invoice，不包含销售税`],
                ["客户账单总额", overview.invoice_total_cents, "税前收入加代收销售税"],
                ["代收销售税", overview.tax_collected_cents, "单独统计，不作为营业收入"],
              ].map(([label, value, note]) => (
                <Card key={String(label)} className="border-border/60 bg-background/40 shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatCents(Number(value))}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">配件销售收入</p><p className="mt-1 text-xl font-bold tabular-nums">{formatCents(overview.parts_revenue_cents)}</p><p className="mt-1 text-xs text-muted-foreground">Invoice 中向客户收取的配件售价</p></CardContent></Card>
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">人工维修收入</p><p className="mt-1 text-xl font-bold tabular-nums">{formatCents(overview.labor_revenue_cents)}</p><p className="mt-1 text-xs text-muted-foreground">人工费率 × 实际工时</p></CardContent></Card>
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">清洁及杂费收入</p><p className="mt-1 text-xl font-bold tabular-nums">{formatCents(overview.misc_revenue_cents)}</p><p className="mt-1 text-xs text-muted-foreground">当前包括维修单清洁费</p></CardContent></Card>
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="flex items-start gap-3 p-4"><Clock3 className="mt-0.5 size-5 text-primary" /><div><p className="text-xs text-muted-foreground">人工总工时</p><p className="mt-1 text-xl font-bold tabular-nums">{overview.labor_hours.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 小时</p><p className="mt-1 text-xs text-muted-foreground">本期已完成维修单人工时间</p></div></CardContent></Card>
            </div>
          </section>

          <section className="surface-panel p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-300"><ShoppingCart className="size-5" /></span>
              <div><h2 className="font-bold">支出与成本分析</h2><p className="text-xs text-muted-foreground">采购现金支出和实际消耗成本分别统计</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="flex items-center gap-4 p-4"><ShoppingCart className="size-6 text-amber-500" /><div><p className="text-xs text-muted-foreground">本期采购现金支出</p><p className="text-2xl font-bold tabular-nums">{formatCents(overview.purchase_spend_cents)}</p><p className="text-xs text-muted-foreground">{overview.purchase_count} 张已入库采购单，不等于本期成本</p></div></CardContent></Card>
              <Card className="border-border/60 bg-background/40 shadow-none"><CardContent className="flex items-center gap-4 p-4"><ReceiptText className="size-6 text-orange-500" /><div><p className="text-xs text-muted-foreground">本期配件消耗成本</p><p className="text-2xl font-bold tabular-nums">{formatCents(overview.parts_cost_cents)}</p><p className="text-xs text-muted-foreground">仅计算已完成维修单实际使用的配件</p></div></CardContent></Card>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="surface-panel p-5">
              <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Boxes className="size-5" /></span><div><h2 className="font-bold">库存</h2><p className="text-xs text-muted-foreground">当前库存资产与库存风险</p></div></div>
              <p className="text-xs text-muted-foreground">当前库存价值</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatCents(overview.inventory_value_cents)}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm"><div><p className="text-muted-foreground">已预留</p><p className="mt-1 font-bold">{overview.reserved_units} 件</p></div><div><p className="text-muted-foreground">低库存商品</p><p className={`mt-1 font-bold ${overview.low_stock_count > 0 ? "text-amber-600" : "text-emerald-600"}`}>{overview.low_stock_count} 项</p></div></div>
            </section>
            <section className="surface-panel p-5">
              <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-violet-500/10 p-2.5 text-violet-500"><BarChart3 className="size-5" /></span><div><h2 className="font-bold">利润与现金对比</h2><p className="text-xs text-muted-foreground">分别观察经营毛利和采购现金流</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">经营毛利</p><p className="mt-1 text-2xl font-bold text-emerald-600">{formatCents(overview.gross_profit_cents)}</p><p className="text-xs text-muted-foreground">税前收入 − 配件消耗成本</p></div><div><p className="text-xs text-muted-foreground">现金收支对比</p><p className={`mt-1 text-2xl font-bold ${overview.cash_difference_cents < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600"}`}>{formatCents(overview.cash_difference_cents)}</p><p className="text-xs text-muted-foreground">Invoice 总额 − 本期采购支出</p></div></div>
            </section>
          </div>
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Invoice 记录</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleAllInvoices} disabled={invoices.length === 0}>{allSelected ? "取消全选" : "全选"}</Button>
            <Button size="sm" onClick={exportSelectedInvoices} disabled={selectedInvoiceIds.size === 0 || exporting}>
              <Download className="size-4" />
              {exporting ? "正在导出…" : `导出已选（${selectedInvoiceIds.size}）`}
            </Button>
          </div>
        </div>
        <div className="space-y-3 sm:hidden">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="surface-panel p-4">
              <div className="flex items-start gap-3"><input type="checkbox" checked={selectedInvoiceIds.has(invoice.id)} onChange={() => toggleInvoice(invoice.id)} aria-label={`选择 Invoice ${invoice.invoice_number}`} className="mt-1 size-5 shrink-0 accent-primary" /><div className="flex min-w-0 flex-1 items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-mono text-xs text-primary">{invoice.invoice_number}</p><p className="mt-1 font-semibold">{invoice.case.plate ?? invoice.case.vin ?? invoice.case.unit_number ?? "-"}</p><p className="text-xs text-muted-foreground">{invoice.case.customer_name ?? "-"} · {new Date(invoice.issued_at).toLocaleDateString("zh-CN")}</p></div><p className="shrink-0 text-lg font-bold tabular-nums">{formatCents(invoice.grand_total_cents)}</p></div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-y py-3 text-center"><div><p className="text-[11px] text-muted-foreground">配件收入</p><p className="text-sm font-semibold">{formatCents(invoice.parts_revenue_cents)}</p></div><div><p className="text-[11px] text-muted-foreground">人工收入</p><p className="text-sm font-semibold">{formatCents(invoice.labor_revenue_cents)}</p></div><div><p className="text-[11px] text-muted-foreground">配件成本</p><p className="text-sm font-semibold">{formatCents(invoice.parts_cost_cents)}</p></div></div>
              <div className="mt-3 flex items-center gap-2"><Select value={invoice.payment_status} onValueChange={(value) => updatePayment(invoice.id, value)}><SelectTrigger className="min-w-0 flex-1"><SelectValue>{payment(invoice.payment_status)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="UNPAID">未付款</SelectItem><SelectItem value="PARTIAL">部分付款</SelectItem><SelectItem value="PAID">已付款</SelectItem><SelectItem value="VOID">已作废</SelectItem></SelectContent></Select><Link className="inline-flex min-h-11 items-center rounded-xl border px-4 font-medium text-primary" href={`/cases/${invoice.case_id}`}>详情</Link></div>
            </div>
          ))}
        </div>
        <div className="surface-panel hidden overflow-x-auto sm:block">
          <table className="data-table w-full min-w-[1220px] text-sm">
            <thead><tr className="border-b bg-muted/50 text-left"><th className="w-12 p-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAllInvoices} aria-label="全选 Invoice" className="size-4 accent-primary" /></th><th className="p-3">Invoice</th><th className="p-3">车辆 / 客户</th><th className="p-3">日期</th><th className="p-3 text-right">配件收入</th><th className="p-3 text-right">人工收入</th><th className="p-3 text-right">清洁/杂费</th><th className="p-3 text-right">税前收入</th><th className="p-3 text-right">配件成本</th><th className="p-3 text-right">账单总额</th><th className="p-3">付款状态</th><th className="p-3" /></tr></thead>
            <tbody>{invoices.map((invoice) => <tr key={invoice.id} className={`border-b last:border-0 ${selectedInvoiceIds.has(invoice.id) ? "bg-primary/[0.04]" : ""}`}><td className="p-3 text-center"><input type="checkbox" checked={selectedInvoiceIds.has(invoice.id)} onChange={() => toggleInvoice(invoice.id)} aria-label={`选择 Invoice ${invoice.invoice_number}`} className="size-4 accent-primary" /></td><td className="p-3 font-mono text-xs">{invoice.invoice_number}</td><td className="p-3"><p className="font-medium">{invoice.case.plate ?? invoice.case.vin ?? invoice.case.unit_number ?? "-"}</p><p className="text-xs text-muted-foreground">{invoice.case.customer_name ?? "-"}</p></td><td className="p-3">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")}</td><td className="p-3 text-right">{formatCents(invoice.parts_revenue_cents)}</td><td className="p-3 text-right">{formatCents(invoice.labor_revenue_cents)}</td><td className="p-3 text-right">{formatCents(invoice.cleaning_fee_cents)}</td><td className="p-3 text-right font-medium">{formatCents(invoice.parts_revenue_cents + invoice.labor_revenue_cents + invoice.cleaning_fee_cents)}</td><td className="p-3 text-right">{formatCents(invoice.parts_cost_cents)}</td><td className="p-3 text-right font-bold">{formatCents(invoice.grand_total_cents)}</td><td className="p-3"><Select value={invoice.payment_status} onValueChange={(value) => updatePayment(invoice.id, value)}><SelectTrigger className="w-32"><SelectValue>{payment(invoice.payment_status)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="UNPAID">未付款</SelectItem><SelectItem value="PARTIAL">部分付款</SelectItem><SelectItem value="PAID">已付款</SelectItem><SelectItem value="VOID">已作废</SelectItem></SelectContent></Select></td><td className="p-3"><Link className="font-medium text-primary hover:underline" href={`/cases/${invoice.case_id}`}>详情</Link></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
