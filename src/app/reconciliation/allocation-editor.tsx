"use client";

import { useState } from "react";
import { ListOrdered, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCents } from "@/lib/utils";
import { allocateVisibleInvoices, AllocationInvoice, filterAllocationInvoices, parsePaymentCents } from "@/lib/reconciliation-view";

export function AllocationEditor({ invoices, amounts, onChange, available, disabled = false }: {
  invoices: AllocationInvoice[]; amounts: Record<string, string>;
  onChange: (amounts: Record<string, string>) => void; available: number; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [datesOpen, setDatesOpen] = useState(false);
  const selectedCount = invoices.filter((invoice) => (parsePaymentCents(amounts[invoice.id] ?? "") ?? 0) > 0).length;
  const visible = filterAllocationInvoices(invoices, query, start, end);
  const invalidDates = Boolean(start && end && start > end);
  const hiddenSelected = invoices.filter((invoice) => !visible.some((item) => item.id === invoice.id) && (parsePaymentCents(amounts[invoice.id] ?? "") ?? 0) > 0).length;
  const dateClass = datesOpen ? "" : "hidden sm:block";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">待销账 Invoice <span className="ml-1 text-sm font-normal text-muted-foreground">{visible.length} 张</span></h3>
      <div className="flex flex-wrap items-center gap-2">{selectedCount > 0 && <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({})}><RotateCcw className="size-3.5" />清空本次 {selectedCount} 张</Button>}<Button variant="outline" size="sm" disabled={disabled || !visible.length || invalidDates} onClick={() => onChange(allocateVisibleInvoices(invoices, visible, amounts, available))}><ListOrdered className="size-4" />按最早账单预填</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_175px_175px_auto] lg:items-end">
      <div><div className="mb-1.5 flex items-center justify-between"><label htmlFor="allocation-query" className="text-xs text-muted-foreground">搜索账单</label><button type="button" className="py-1 text-xs text-primary sm:hidden" aria-expanded={datesOpen} onClick={() => setDatesOpen((open) => !open)}>{datesOpen ? "收起日期" : `开票日期${start || end ? " · 已筛选" : ""}`}</button></div><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="allocation-query" placeholder="Invoice / 车牌 / 车号" value={query} className="pl-9" onChange={(event) => setQuery(event.target.value)} /></div></div>
      <div className={dateClass}><span className="mb-1.5 block text-xs text-muted-foreground">开票开始日期</span><DatePicker value={start} onChange={setStart} ariaLabel="开票开始日期" /></div>
      <div className={dateClass}><span className="mb-1.5 block text-xs text-muted-foreground">开票结束日期</span><DatePicker value={end} onChange={setEnd} ariaLabel="开票结束日期" /></div>
      <Button className={!query && !start && !end ? "hidden sm:inline-flex" : ""} variant="ghost" disabled={!query && !start && !end} onClick={() => { setQuery(""); setStart(""); setEnd(""); }}>重置</Button>
    </div>
    {invalidDates && <p role="alert" className="text-sm text-destructive">开票结束日期不能早于开始日期</p>}
    {hiddenSelected > 0 && <p role="status" className="text-sm text-primary">另有 {hiddenSelected} 张已填写金额的账单被筛选隐藏，仍计入本次分配。<button type="button" className="ml-2 underline" onClick={() => { setQuery(""); setStart(""); setEnd(""); }}>显示全部</button></p>}
    {!visible.length ? <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{invoices.length ? "没有匹配的 Invoice" : "该公司暂无未结清 Invoice，可先保存收款"}</p> : <div className="overflow-hidden rounded-xl border">
      <div className="hidden grid-cols-[minmax(150px,1fr)_110px_100px_110px_140px] gap-3 border-b bg-muted/35 px-4 py-3 text-xs text-muted-foreground md:grid"><span>Invoice / 开票日期</span><span className="text-right">账单金额</span><span className="text-right">已付</span><span className="text-right">未付</span><span className="text-right">本次销账</span></div>
      <div className="divide-y">{visible.map((invoice) => {
        const cents = parsePaymentCents(amounts[invoice.id] ?? "");
        const invalid = cents === null || cents > invoice.outstanding_cents;
        return <div key={invoice.id} className={"grid grid-cols-3 gap-3 border-l-2 px-4 py-3 md:grid-cols-[minmax(150px,1fr)_110px_100px_110px_140px] md:items-center " + (invalid ? "border-l-destructive bg-destructive/5" : (cents ?? 0) > 0 ? "border-l-primary bg-primary/5" : "border-l-transparent")}>
          <div className="col-span-3 min-w-0 md:col-span-1"><p className="break-all font-mono text-xs font-semibold">{invoice.invoice_number}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(invoice.issued_at).toLocaleDateString("zh-CN")} · {invoice.case.plate || invoice.case.unit_number || "—"}</p></div>
          {[["账单", invoice.grand_total_cents], ["已付", invoice.paid_cents], ["未付", invoice.outstanding_cents]].map(([label, amount]) => <div key={label} className="min-w-0 md:text-right"><span className="mb-1 block text-xs text-muted-foreground md:hidden">{label}</span><span className="text-sm font-medium tabular-nums">{formatCents(Number(amount))}</span></div>)}
          <div className="col-span-3 md:col-span-1"><label htmlFor={`allocation-${invoice.id}`} className="mb-1 block text-xs text-muted-foreground md:hidden">本次销账</label><Input id={`allocation-${invoice.id}`} aria-label={`Invoice ${invoice.invoice_number} 本次销账金额`} aria-invalid={invalid} inputMode="decimal" className={`text-right tabular-nums ${invalid ? "border-destructive" : ""}`} value={amounts[invoice.id] ?? ""} placeholder="0.00" disabled={disabled} onChange={(event) => onChange({ ...amounts, [invoice.id]: event.target.value })} />
            {invalid ? <p className="mt-1 text-xs text-destructive">{cents === null ? "请输入有效金额，最多两位小数" : "超过未付余额"}</p> : (cents ?? 0) > 0 && <p className={`mt-1 text-right text-xs ${cents === invoice.outstanding_cents ? "text-primary" : "text-muted-foreground"}`}>{cents === invoice.outstanding_cents ? "本次后结清" : `本次后仍欠 ${formatCents(invoice.outstanding_cents - cents!)}`}</p>}
          </div>
        </div>;
      })}</div>
    </div>}
  </div>;
}
