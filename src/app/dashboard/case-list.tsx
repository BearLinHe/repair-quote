"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { CircleDollarSign, ClipboardCheck, Clock3, Files, Inbox, RefreshCw, Search } from "lucide-react";

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

  const statusLabel = (s: string) =>
    ({ SUBMITTED: "已提交", IN_PROGRESS: "进行中", CANCELED: "已取消", COMPLETED: "已完成" })[s] ?? s;
  const statusClass = (s: string) =>
    ({
      SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-950/50 dark:text-sky-300",
      IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300",
      COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300",
      CANCELED: "bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300",
    })[s] ?? "bg-muted text-muted-foreground ring-border";
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
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all active:scale-[0.99] active:bg-muted/40"
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
                  <span className="ml-auto font-medium text-primary">查看详情 →</span>
                </div>
              </Link>
            ))}
          </div>
          {/* 桌面端：表格 */}
          <div className="surface-panel hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3.5 text-left font-semibold">Invoice Number</th>
                    <th className="px-4 py-3.5 text-left font-semibold">车牌</th>
                    <th className="px-4 py-3.5 text-left font-semibold">车架号</th>
                    <th className="px-4 py-3.5 text-left font-semibold">车号</th>
                    <th className="px-4 py-3.5 text-left font-semibold">状态</th>
                    <th className="px-4 py-3.5 text-right font-semibold">总价</th>
                    <th className="px-4 py-3.5 text-left font-semibold">创建时间</th>
                    <th className="px-4 py-3.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCases.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-4 font-mono text-xs tabular-nums">{c.invoice_number}</td>
                      <td className="px-4 py-4 font-medium">{c.plate ?? "-"}</td>
                      <td className="max-w-52 truncate px-4 py-4 text-muted-foreground">{c.vin ?? "-"}</td>
                      <td className="px-4 py-4">{c.unit_number ?? "-"}</td>
                      <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(c.status)}`}>{statusLabel(c.status)}</span></td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">{formatCents(c.grand_total_cents)}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/cases/${c.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
