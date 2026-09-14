"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import { formatCents } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3, Download, Eye, Files, Inbox, RefreshCw, Search } from "lucide-react";

type CaseRow = {
  id: string;
  invoice_number: string;
  plate: string | null;
  vin: string | null;
  unit_number: string | null;
  status: string;
  grand_total_cents: number;
  created_at: string;
};

const statusLabel = (status: string) =>
  ({ SUBMITTED: "已提交", IN_PROGRESS: "进行中", CANCELED: "已取消", COMPLETED: "已完成" })[status] ?? status;

const statusClass = (status: string) =>
  ({
    SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300",
    CANCELED: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300",
  })[status] ?? "bg-muted text-muted-foreground ring-border";

export function CaseList() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"unauthorized" | "server" | "network" | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(async () => {
      const q = new URLSearchParams();
      if (query.trim()) q.set("query", query.trim());

      try {
        const response = await fetch(`/api/cases?${q}`, { signal: controller.signal });
        if (response.status === 401) {
          setError("unauthorized");
          return;
        }
        if (!response.ok) {
          setError("server");
          return;
        }
        const data = (await response.json()) as { cases?: CaseRow[] };
        setCases(data.cases ?? []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError("network");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryKey]);

  const visibleCases = useMemo(
    () => statusFilter === "ALL" ? cases : cases.filter((item) => item.status === statusFilter),
    [cases, statusFilter],
  );
  const summary = useMemo(() => ({
    total: cases.length,
    active: cases.filter((item) => item.status === "IN_PROGRESS").length,
    completed: cases.filter((item) => item.status === "COMPLETED").length,
    amount: cases.filter((item) => item.status !== "CANCELED").reduce((sum, item) => sum + item.grand_total_cents, 0),
  }), [cases]);

  return (
    <div className="space-y-5">
      {!loading && !error && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "全部维修单", value: summary.total, icon: Files, note: "累计创建" },
          { label: "正在维修", value: summary.active, icon: Clock3, note: "需要跟进" },
          { label: "已完成", value: summary.completed, icon: ClipboardCheck, note: "已形成 Invoice" },
          { label: "有效报价总额", value: formatCents(summary.amount), icon: CircleDollarSign, note: "不含已取消" },
        ].map(({ label, value, icon: Icon, note }) => <div key={label} className="surface-panel flex items-center gap-4 p-4 sm:p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5"/></span>
          <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-xl font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{note}</p></div>
        </div>)}
      </div>}
      <div className="surface-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="搜索 Invoice Number / 车牌 / 车架号 / 车号"
          className="min-h-12 w-full rounded-xl border border-input bg-background/70 py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-ring/20"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-muted/70 p-1 sm:flex sm:overflow-x-auto">
        {[["ALL","全部"],["SUBMITTED","已提交"],["IN_PROGRESS","进行中"],["COMPLETED","已完成"],["CANCELED","已取消"]].map(([value, label]) => <button key={value} onClick={() => setStatusFilter(value)} className={`min-h-9 min-w-0 whitespace-nowrap rounded-lg px-1 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${statusFilter === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
      </div>
      </div>
      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <RefreshCw className="size-4 animate-spin" />
          正在加载维修单...
        </div>
      ) : error === "unauthorized" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-medium text-amber-950">登录已失效</p>
          <p className="mt-1 text-sm text-amber-800">请重新登录后继续查看维修单。</p>
          <Link href="/sign-in" className={buttonVariants({ className: "mt-4" })}>
            重新登录
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="font-medium text-destructive">
            {error === "network" ? "网络连接失败" : "维修单加载失败"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">请稍后重试，已有数据不会受到影响。</p>
          <Button variant="outline" className="mt-4" onClick={() => setRetryKey((key) => key + 1)}>
            重新加载
          </Button>
        </div>
      ) : cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/70 p-10 text-center text-muted-foreground sm:p-14">
          <Inbox className="mx-auto mb-3 size-9 text-muted-foreground/70" />
          <p className="font-medium text-foreground">暂无维修单</p>
          <p className="mt-1 text-sm">新建维修单后会显示在这里。</p>
        </div>
      ) : visibleCases.length === 0 ? (
        <div className="surface-panel p-10 text-center text-muted-foreground">
          <Inbox className="mx-auto mb-3 size-8" />
          <p className="font-medium text-foreground">当前筛选下没有维修单</p>
          <button className="mt-2 text-sm font-medium text-primary hover:underline" onClick={() => setStatusFilter("ALL")}>查看全部维修单</button>
        </div>
      ) : (
        <>
          {/* 移动端：卡片列表 */}
          <div className="space-y-3 sm:hidden">
            {visibleCases.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold">{c.plate ?? c.vin ?? `车号 ${c.unit_number ?? "-"}`}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(c.status)}`}>
                    {statusLabel(c.status)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="w-full font-mono text-xs text-muted-foreground">Invoice #{c.invoice_number}</span>
                  <span className="font-medium text-foreground">{formatCents(c.grand_total_cents)}</span>
                  <span>{new Date(c.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t pt-3">
                  <Link href={`/cases/${c.id}`} className={buttonVariants({ variant: "outline", className: c.status === "COMPLETED" ? "" : "col-span-2" })}>
                    查看详情
                  </Link>
                  {c.status === "COMPLETED" && (
                    <a href={`/api/cases/${c.id}/pdf`} download className={buttonVariants()}>
                      <Download className="size-4" />
                      下载 PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <CaseDesktopTable cases={visibleCases} />
        </>
      )}
    </div>
  );
}

function CaseDesktopTable({ cases }: { cases: CaseRow[] }) {
  const columns = useMemo<ColumnDef<CaseRow>[]>(() => [
    {
      accessorKey: "invoice_number",
      header: "Invoice",
      size: 170,
      cell: ({ row: { original: repairCase } }) => <div className="min-w-0"><Link href={`/cases/${repairCase.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{repairCase.invoice_number}</Link><p className="mt-1 truncate text-xs text-muted-foreground">{repairCase.plate ? `车牌 · ${repairCase.plate}` : "未填写车牌"}</p></div>,
    },
    {
      accessorKey: "vin",
      header: "车架号",
      size: 220,
      cell: ({ row }) => <span className="block truncate font-mono text-xs text-muted-foreground" title={row.original.vin ?? undefined}>{row.original.vin ?? "-"}</span>,
    },
    {
      accessorKey: "unit_number",
      header: "车号",
      size: 150,
      cell: ({ row }) => <span className="font-medium">{row.original.unit_number ?? "-"}</span>,
    },
    {
      accessorKey: "status",
      header: "状态",
      size: 110,
      cell: ({ row }) => <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(row.original.status)}`}>{statusLabel(row.original.status)}</span>,
    },
    {
      accessorKey: "grand_total_cents",
      header: "总价",
      size: 130,
      cell: ({ row }) => <span className="text-base font-bold tabular-nums">{formatCents(row.original.grand_total_cents)}</span>,
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      size: 120,
      cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{new Date(row.original.created_at).toLocaleDateString("zh-CN")}</span>,
    },
    {
      id: "actions",
      header: "操作",
      size: 92,
      cell: ({ row: { original: repairCase } }) => <div className="flex items-center justify-end gap-1.5">{repairCase.status === "COMPLETED" && <a href={`/api/cases/${repairCase.id}/pdf`} download className="inline-grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary" aria-label={`下载 Invoice ${repairCase.invoice_number} PDF`} title="下载 PDF"><Download className="size-4" /></a>}<Link href={`/cases/${repairCase.id}`} className="inline-grid size-9 place-items-center rounded-lg border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary" aria-label={`查看维修单 ${repairCase.invoice_number}`} title="查看详情"><Eye className="size-4" /></Link></div>,
    },
  ], []);

  const table = useReactTable({
    data: cases,
    columns,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;
  const start = cases.length === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, cases.length);

  return <div className="surface-panel hidden overflow-hidden sm:block">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div><h2 className="font-semibold">维修单明细</h2><p className="text-xs text-muted-foreground">共 {cases.length} 条</p></div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>每页</span><select value={pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))} className="h-8 rounded-lg border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/40">{[20, 50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}</select><span>条</span></div>
    </div>
    <div className="overflow-x-auto">
      <table className="data-table w-full min-w-[992px] table-fixed text-sm">
        <thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id} className="border-b text-left">{headerGroup.headers.map((header) => <th key={header.id} className={`h-11 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground ${header.column.id === "grand_total_cents" || header.column.id === "actions" ? "text-right" : ""}`} style={{ width: header.getSize() }}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className={`h-[68px] px-3 align-middle ${cell.column.id === "grand_total_cents" || cell.column.id === "actions" ? "text-right" : ""}`} style={{ width: cell.column.getSize() }}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3"><p className="text-sm text-muted-foreground">第 {start}–{end} 条，共 {cases.length} 条</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft className="size-4" />上一页</Button><span className="min-w-16 text-center text-sm tabular-nums">{pageIndex + 1} / {table.getPageCount()}</span><Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>下一页<ChevronRight className="size-4" /></Button></div></div>
  </div>;
}
