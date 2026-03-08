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
          className="flex-1 rounded border border-input bg-background px-3 py-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {loading ? (
        <p className="text-muted-foreground">加载中...</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-left">车牌</th>
                <th className="p-2 text-left">车架号</th>
                <th className="p-2 text-left">车号</th>
                <th className="p-2 text-left">状态</th>
                <th className="p-2 text-right">总价</th>
                <th className="p-2 text-left">创建时间</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2">{c.plate ?? "-"}</td>
                  <td className="p-2">{c.vin ?? "-"}</td>
                  <td className="p-2">{c.unit_number ?? "-"}</td>
                  <td className="p-2">{statusLabel(c.status)}</td>
                  <td className="p-2 text-right">{formatCents(c.grand_total_cents)}</td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/cases/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cases.length === 0 && (
            <p className="p-4 text-center text-muted-foreground">暂无维修单</p>
          )}
        </div>
      )}
    </div>
  );
}
