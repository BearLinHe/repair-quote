"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CaseRow = {
  id: string;
  plate: string | null;
  vin: string | null;
  unit_number: number | null;
  status: string;
  grand_total_cents: number;
  created_at: string;
};

export function CaseList() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams();
    if (query.trim()) q.set("query", query.trim());
    fetch(`/api/cases?${q}`)
      .then(async (r) => {
        const text = await r.text();
        if (!text.trim()) return { cases: [] };
        try {
          return JSON.parse(text) as { cases?: CaseRow[]; error?: unknown };
        } catch {
          return { cases: [] };
        }
      })
      .then((data) => {
        if (data.error) return;
        setCases(data.cases ?? []);
      })
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [query]);

  const formatCents = (c: number) => `${(c / 100).toFixed(2)} 元`;
  const statusLabel = (s: string) =>
    ({ SUBMITTED: "已提交", IN_PROGRESS: "进行中", CANCELED: "已取消", COMPLETED: "已完成" })[s] ?? s;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="搜索车牌 / 车架号 / 车号"
          className="flex-1 min-h-[44px] rounded-lg border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-muted-foreground py-4">加载中...</p>
      ) : cases.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          暂无维修单
        </div>
      ) : (
        <>
          {/* 移动端：卡片列表 */}
          <div className="block sm:hidden space-y-3">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/cases/${c.id}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm active:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium">{c.plate ?? c.vin ?? `车号 ${c.unit_number ?? "-"}`}</span>
                  <span className="text-primary text-sm font-medium">详情 →</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span>状态：{statusLabel(c.status)}</span>
                  <span>总价：{formatCents(c.grand_total_cents)}</span>
                  <span>{new Date(c.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
              </Link>
            ))}
          </div>
          {/* 桌面端：表格 */}
          <div className="hidden sm:block rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">车牌</th>
                    <th className="p-3 text-left font-medium">车架号</th>
                    <th className="p-3 text-left font-medium">车号</th>
                    <th className="p-3 text-left font-medium">状态</th>
                    <th className="p-3 text-right font-medium">总价</th>
                    <th className="p-3 text-left font-medium">创建时间</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">{c.plate ?? "-"}</td>
                      <td className="p-3">{c.vin ?? "-"}</td>
                      <td className="p-3">{c.unit_number ?? "-"}</td>
                      <td className="p-3">{statusLabel(c.status)}</td>
                      <td className="p-3 text-right">{formatCents(c.grand_total_cents)}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="p-3">
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
