"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/utils";
import type { CaseStatus } from "@prisma/client";

type LaborRow = {
  id: string;
  name: string;
  hours: number;
  rate_cents: number;
  line_total_cents: number;
};

type CaseData = {
  id: string;
  plate: string | null;
  vin: string | null;
  unit_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  status: CaseStatus;
  parts_subtotal_cents: number;
  labor_subtotal_cents: number;
  cleaning_fee_cents: number;
  apply_tax: boolean;
  tax_cents: number;
  grand_total_cents: number;
  repair_items: Array<{ id: string; name: string; sort_order: number }>;
  parts: Array<{ id: string; name: string; unit_price_cents: number; qty: number; line_total_cents: number }>;
  labor: LaborRow[];
  status_logs: Array<{
    id: string;
    from_status: CaseStatus | null;
    to_status: CaseStatus;
    changed_by: string;
    changed_at: string;
    note: string | null;
  }>;
};

type History = {
  repair_item_names: string[];
  part_templates: Array<{ name: string; last_unit_price_cents: number }>;
  labor_templates: Array<{ name: string; last_rate_cents: number }>;
};

/** 状态历史时间：按本地时区、统一格式显示，避免显示错乱 */
function formatStatusLogTime(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function CaseDetail({ caseData }: { caseData: CaseData }) {
  const [caseState, setCaseState] = useState(caseData);
  const [history, setHistory] = useState<History | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newPartPrice, setNewPartPrice] = useState("");
  const [newPartQty, setNewPartQty] = useState("1");
  const [newLaborName, setNewLaborName] = useState("");
  const [newLaborHours, setNewLaborHours] = useState("");
  const [newLaborRate, setNewLaborRate] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [loading, setLoading] = useState(false);

  const caseId = caseData.id;

  const refreshCase = async () => {
    const res = await fetch(`/api/cases/${caseId}`);
    if (res.ok) {
      const data = await res.json();
      setCaseState(data);
    }
  };

  const toggleTax = async (apply_tax: boolean) => {
    setLoading(true);
    try {
      await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_tax }),
      });
      await refreshCase();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch(`/api/cases/${caseId}/history`)
      .then((r) => r.json())
      .then((data) => setHistory(data));
  }, [caseId]);

  const addRepairItem = async (name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/repair-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) await refreshCase();
    } finally {
      setLoading(false);
      setNewItemName("");
    }
  };

  const updateRepairItem = async (itemId: string, name: string) => {
    if (!name.trim()) return;
    await fetch(`/api/cases/${caseId}/repair-items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: itemId, name: name.trim() }),
    });
    await refreshCase();
  };

  const deleteRepairItem = async (itemId: string) => {
    await fetch(`/api/cases/${caseId}/repair-items?id=${itemId}`, { method: "DELETE" });
    await refreshCase();
  };

  const addPart = async (name: string, unit_price_cents: number, qty: number) => {
    if (!name.trim() || unit_price_cents < 0 || qty < 1) return;
    setLoading(true);
    try {
      await fetch(`/api/cases/${caseId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), unit_price_cents, qty }),
      });
      await refreshCase();
      setNewPartName("");
      setNewPartPrice("");
      setNewPartQty("1");
    } finally {
      setLoading(false);
    }
  };

  const updatePart = async (
    partId: string,
    name: string,
    unit_price_cents: number,
    qty: number
  ) => {
    await fetch(`/api/cases/${caseId}/parts`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: partId, name, unit_price_cents, qty }),
    });
    await refreshCase();
  };

  const deletePart = async (partId: string) => {
    await fetch(`/api/cases/${caseId}/parts?id=${partId}`, { method: "DELETE" });
    await refreshCase();
  };

  const addLabor = async (name: string, hours: number, rate_cents: number) => {
    if (!name.trim() || hours < 0 || rate_cents < 0) return;
    setLoading(true);
    try {
      await fetch(`/api/cases/${caseId}/labor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), hours, rate_cents }),
      });
      await refreshCase();
      setNewLaborName("");
      setNewLaborHours("");
      setNewLaborRate("");
    } finally {
      setLoading(false);
    }
  };

  const updateLabor = async (
    laborId: string,
    name: string,
    hours: number,
    rate_cents: number
  ) => {
    await fetch(`/api/cases/${caseId}/labor`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: laborId, name, hours, rate_cents }),
    });
    await refreshCase();
  };

  const deleteLabor = async (laborId: string) => {
    await fetch(`/api/cases/${caseId}/labor?id=${laborId}`, { method: "DELETE" });
    await refreshCase();
  };

  const changeStatus = async (to_status: CaseStatus) => {
    await fetch(`/api/cases/${caseId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_status, note: statusNote || undefined }),
    });
    await refreshCase();
    setStatusNote("");
  };

  const downloadPdf = async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/pdf`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error ?? "生成 PDF 失败");
        return;
      }
      const usedCustomFont = res.headers.get("X-PDF-Font-Used");
      if (usedCustomFont === "false") {
        alert(
          "未使用指定字体（NotoSerifSC-Medium.ttf），PDF 中的中文可能显示为方框或问号。请确认 public/fonts/NotoSerifSC-Medium.ttf 存在且有效。"
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quote-${caseId.slice(0, 8)}.pdf`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert("生成或下载 PDF 时出错");
    }
  };

  const status = caseState.status;
  const canSubmitToProgress = status === "SUBMITTED";
  const canSubmitToCancel = status === "SUBMITTED";
  const canProgressToComplete = status === "IN_PROGRESS";
  const canProgressToCancel = status === "IN_PROGRESS";
  const isFinal = status === "CANCELED" || status === "COMPLETED";
  /** 仅「进行中」时可编辑维修项目、配件、人工；已提交未开始做单时仅可查看 */
  const canEditDetails = status === "IN_PROGRESS";
  const statusLabel = (s: CaseStatus) =>
    ({ SUBMITTED: "已提交", IN_PROGRESS: "进行中", CANCELED: "已取消", COMPLETED: "已完成" })[s] ?? s;

  return (
    <div className="space-y-8 pb-8">
      <Card className="shadow-sm">
        <CardHeader className="pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-lg">车辆与司机</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 sm:p-6 sm:pt-0">
          <p className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span>车牌：{caseState.plate ?? "-"}</span>
            <span className="text-muted-foreground hidden sm:inline">|</span>
            <span>车架号：{caseState.vin ?? "-"}</span>
            <span className="text-muted-foreground hidden sm:inline">|</span>
            <span>车号：{caseState.unit_number ?? "-"}</span>
          </p>
          <p className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span>司机：{caseState.customer_name ?? "-"}</span>
            {caseState.customer_phone && (
              <>
                <span className="text-muted-foreground hidden sm:inline">|</span>
                <span>{caseState.customer_phone}</span>
              </>
            )}
          </p>
          <p className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span>状态：<span className="font-medium">{statusLabel(caseState.status)}</span></span>
            <span className="text-muted-foreground hidden sm:inline">|</span>
            <span>总价：{formatCents(caseState.grand_total_cents)}</span>
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {canSubmitToProgress && (
          <Button onClick={() => changeStatus("IN_PROGRESS")} disabled={loading} className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-none">
            开始做单
          </Button>
        )}
        {canSubmitToCancel && (
          <Button variant="destructive" onClick={() => changeStatus("CANCELED")} disabled={loading} className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-none">
            取消工单
          </Button>
        )}
        {canProgressToComplete && (
          <Button onClick={() => changeStatus("COMPLETED")} disabled={loading} className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-none">
            完成
          </Button>
        )}
        {canProgressToCancel && (
          <Button variant="destructive" onClick={() => changeStatus("CANCELED")} disabled={loading} className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-none">
            取消工单
          </Button>
        )}
        <Button variant="outline" onClick={downloadPdf} className="min-h-[44px] sm:min-h-[40px] flex-1 sm:flex-none">
          生成 PDF
        </Button>
      </div>
      {!isFinal && (
        <div className="flex gap-2 items-center">
          <Input
            placeholder="状态变更备注 (可选)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            className="flex-1 min-h-[44px] sm:min-h-[40px] max-w-full sm:max-w-xs"
          />
        </div>
      )}

      <Card className="shadow-sm">
        <CardHeader className="pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-lg">状态历史</CardTitle>
        </CardHeader>
        <CardContent className="sm:p-6 sm:pt-0">
          <ul className="space-y-2 text-sm">
            {caseState.status_logs.map((log) => (
              <li key={log.id} className="flex items-center gap-2 whitespace-nowrap overflow-x-auto">
                <span className="text-muted-foreground shrink-0">
                  {formatStatusLogTime(log.changed_at)}
                </span>
                <span className="shrink-0">
                  {log.note === "Case created"
                    ? "已创建"
                    : `${log.from_status ? statusLabel(log.from_status) : "—"} → ${statusLabel(log.to_status)}${log.note ? `（${log.note}）` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="w-full flex overflow-x-auto shrink-0 gap-1 p-1 min-h-[44px] sm:min-h-[40px]">
          <TabsTrigger value="items" className="flex-1 min-w-0 shrink-0 text-sm">维修项目</TabsTrigger>
          <TabsTrigger value="parts" className="flex-1 min-w-0 shrink-0 text-sm">配件</TabsTrigger>
          <TabsTrigger value="labor" className="flex-1 min-w-0 shrink-0 text-sm">人工</TabsTrigger>
          <TabsTrigger value="summary" className="flex-1 min-w-0 shrink-0 text-sm">合计</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="space-y-4 mt-4">
          {canEditDetails && (
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:flex-wrap sm:items-end">
              <Input
                placeholder="项目名称"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="w-full sm:max-w-[200px] min-h-[44px] sm:min-h-[40px]"
              />
              <Select
                onValueChange={(v) => {
                  setNewItemName(v);
                }}
                value=""
              >
                <SelectTrigger className="w-full sm:w-[180px] min-h-[44px] sm:min-h-[40px]">
                  <SelectValue placeholder="从历史选择" />
                </SelectTrigger>
                <SelectContent>
                  {history?.repair_item_names?.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addRepairItem(newItemName)} disabled={loading || !newItemName.trim()} className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto">
                新增
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {caseState.repair_items.map((item) => (
              <li key={item.id} className="flex gap-2 items-center flex-wrap">
                {!canEditDetails ? (
                  <span className="py-2">{item.name}</span>
                ) : (
                  <>
                    <Input
                      defaultValue={item.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== item.name) updateRepairItem(item.id, v);
                      }}
                      className="flex-1 min-w-0 min-h-[44px] sm:min-h-[40px]"
                    />
                    <Button variant="destructive" size="sm" onClick={() => deleteRepairItem(item.id)} className="min-h-[44px] sm:min-h-[36px]">
                      删除
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="parts" className="space-y-4 mt-4">
          {canEditDetails && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 sm:items-end">
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">配件名</label>
              <Input
                placeholder="配件名称"
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                className="w-full sm:w-[140px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">单价（元）</label>
              <Input
                type="number"
                step={0.01}
                placeholder="0.00"
                value={newPartPrice}
                onChange={(e) => setNewPartPrice(e.target.value)}
                className="w-full sm:w-[100px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">数量（默认1个）</label>
              <Input
                type="number"
                min={1}
                placeholder="1"
                value={newPartQty}
                onChange={(e) => setNewPartQty(e.target.value)}
                className="w-full sm:w-[80px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">从历史选择</label>
              <Select
              onValueChange={(v) => {
                const t = history?.part_templates?.find((x) => x.name === v);
                if (t) {
                  setNewPartName(t.name);
                  setNewPartPrice((t.last_unit_price_cents / 100).toFixed(2));
                  setNewPartQty("1");
                }
              }}
              value=""
            >
              <SelectTrigger className="w-full sm:w-[160px] min-h-[44px] sm:min-h-[40px]">
                <SelectValue placeholder="从历史选择" />
              </SelectTrigger>
              <SelectContent>
                {history?.part_templates?.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}（{(t.last_unit_price_cents / 100).toFixed(2)} 元）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
            <Button
              onClick={() =>
                addPart(
                  newPartName,
                  Math.round((Number(newPartPrice) || 0) * 100),
                  Math.max(1, parseInt(newPartQty, 10) || 1)
                )
              }
              disabled={loading || !newPartName.trim()}
              className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto"
            >
              新增
            </Button>
          </div>
          )}
          <div className="rounded-lg border border-border overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">名称</th>
                  <th className="p-3 text-right font-medium">单价（元）</th>
                  <th className="p-3 text-right font-medium">数量</th>
                  <th className="p-3 text-right font-medium">小计</th>
                  {canEditDetails && <th className="w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {caseState.parts.map((p) => (
                  <PartRow
                    key={p.id}
                    part={p}
                    readOnly={!canEditDetails}
                    onSave={(name, unit_price_cents, qty) =>
                      updatePart(p.id, name, unit_price_cents, qty)
                    }
                    onDelete={() => deletePart(p.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="labor" className="space-y-4 mt-4">
          {canEditDetails && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-2 sm:items-end">
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">人工名称</label>
              <Input
                placeholder="人工名称"
                value={newLaborName}
                onChange={(e) => setNewLaborName(e.target.value)}
                className="w-full sm:w-[140px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">费率（元/时）</label>
              <Input
                type="number"
                step={0.01}
                placeholder="费率（元/时）"
                value={newLaborRate}
                onChange={(e) => setNewLaborRate(e.target.value)}
                className="w-full sm:w-[100px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">小时</label>
              <Input
                type="number"
                step={0.25}
                placeholder="小时"
                value={newLaborHours}
                onChange={(e) => setNewLaborHours(e.target.value)}
                className="w-full sm:w-[80px] min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-1 w-full sm:w-auto">
              <label className="text-sm font-medium text-muted-foreground">从历史选择</label>
              <Select
                onValueChange={(v) => {
                  const t = history?.labor_templates?.find((x) => x.name === v);
                  if (t) {
                    setNewLaborName(t.name);
                    setNewLaborRate((t.last_rate_cents / 100).toFixed(2));
                    setNewLaborHours("1");
                  }
                }}
                value=""
              >
                <SelectTrigger className="w-full sm:w-[160px] min-h-[44px] sm:min-h-[40px]">
                  <SelectValue placeholder="从历史选择" />
                </SelectTrigger>
                <SelectContent>
                  {history?.labor_templates?.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}（{(t.last_rate_cents / 100).toFixed(2)} 元/时）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() =>
                addLabor(
                  newLaborName,
                  Number(newLaborHours) || 0,
                  Math.round((Number(newLaborRate) || 0) * 100)
                )
              }
              disabled={loading || !newLaborName.trim()}
              className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto"
            >
              新增
            </Button>
          </div>
          )}
          <div className="rounded-lg border border-border overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">名称</th>
                  <th className="p-3 text-right font-medium">费率（元/时）</th>
                  <th className="p-3 text-right font-medium">小时</th>
                  <th className="p-3 text-right font-medium">小计</th>
                  {canEditDetails && <th className="w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {caseState.labor.map((l) => (
                  <LaborRow
                    key={l.id}
                    labor={l}
                    readOnly={!canEditDetails}
                    onSave={(name, hours, rate_cents) =>
                      updateLabor(l.id, name, hours, rate_cents)
                    }
                    onDelete={() => deleteLabor(l.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 sm:pt-6 sm:p-6 space-y-2">
              <p>配件小计：{formatCents(caseState.parts_subtotal_cents)}</p>
              <p>人工小计：{formatCents(caseState.labor_subtotal_cents)}</p>
              <p>清洁费：{formatCents(caseState.cleaning_fee_cents)}</p>
              <div className="flex items-center justify-between gap-3">
                <p className="shrink-0">
                  {caseState.apply_tax ? `税费：${formatCents(caseState.tax_cents)}` : "税费：不收取"}
                </p>
                {canEditDetails ? (
                  <label className="flex items-center gap-2 text-sm select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={caseState.apply_tax}
                      disabled={loading}
                      onChange={(e) => toggleTax(e.target.checked)}
                    />
                    <span>收税</span>
                  </label>
                ) : (
                  <span className="text-sm text-muted-foreground shrink-0">
                    {caseState.apply_tax ? "收税" : "不收税"}
                  </span>
                )}
              </div>
              <p className="font-bold text-lg">总计：{formatCents(caseState.grand_total_cents)}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PartRow({
  part,
  readOnly,
  onSave,
  onDelete,
}: {
  part: { id: string; name: string; unit_price_cents: number; qty: number; line_total_cents: number };
  readOnly?: boolean;
  onSave: (name: string, unit_price_cents: number, qty: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(part.name);
  const [price, setPrice] = useState((part.unit_price_cents / 100).toFixed(2));
  const [qty, setQty] = useState(String(part.qty));
  useEffect(() => {
    setName(part.name);
    setPrice((part.unit_price_cents / 100).toFixed(2));
    setQty(String(part.qty));
  }, [part.name, part.unit_price_cents, part.qty]);
  const handleBlur = () => {
    const up = Math.max(0, Math.round((Number(price) || 0) * 100));
    const q = Math.max(1, parseInt(qty, 10) || 1);
    onSave(name.trim() || part.name, up, q);
  };
  if (readOnly) {
    return (
      <tr className="border-b">
        <td className="p-2 sm:p-3">{part.name}</td>
        <td className="p-2 sm:p-3 text-right">{(part.unit_price_cents / 100).toFixed(2)}</td>
        <td className="p-2 sm:p-3 text-right">{part.qty}</td>
        <td className="p-2 sm:p-3 text-right">{formatCents(part.line_total_cents)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="p-2 sm:p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-full max-w-[160px]"
        />
      </td>
      <td className="p-2 sm:p-3">
        <Input
          type="number"
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-20 sm:w-24 text-right"
        />
      </td>
      <td className="p-2 sm:p-3">
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-16 sm:w-20 text-right"
        />
      </td>
      <td className="p-2 sm:p-3 text-right align-middle">{formatCents(part.line_total_cents)}</td>
      <td className="p-2 sm:p-3">
        <Button variant="destructive" size="sm" onClick={onDelete} className="min-h-[40px] sm:min-h-[32px]">
          删除
        </Button>
      </td>
    </tr>
  );
}

function LaborRow({
  labor,
  readOnly,
  onSave,
  onDelete,
}: {
  labor: LaborRow;
  readOnly?: boolean;
  onSave: (name: string, hours: number, rate_cents: number) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(labor.name);
  const [hours, setHours] = useState(String(labor.hours));
  const [rate, setRate] = useState((labor.rate_cents / 100).toFixed(2));
  useEffect(() => {
    setName(labor.name);
    setHours(String(labor.hours));
    setRate((labor.rate_cents / 100).toFixed(2));
  }, [labor.name, labor.hours, labor.rate_cents]);
  const handleBlur = () => {
    const h = Math.max(0, Number(hours) || 0);
    const r = Math.max(0, Math.round((Number(rate) || 0) * 100));
    onSave(name.trim() || labor.name, h, r);
  };
  if (readOnly) {
    return (
      <tr className="border-b">
        <td className="p-2 sm:p-3">{labor.name}</td>
        <td className="p-2 sm:p-3 text-right">{(labor.rate_cents / 100).toFixed(2)}</td>
        <td className="p-2 sm:p-3 text-right">{labor.hours}</td>
        <td className="p-2 sm:p-3 text-right">{formatCents(labor.line_total_cents)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="p-2 sm:p-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-full max-w-[160px]"
        />
      </td>
      <td className="p-2 sm:p-3">
        <Input
          type="number"
          step={0.01}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-20 sm:w-24 text-right"
        />
      </td>
      <td className="p-2 sm:p-3">
        <Input
          type="number"
          step={0.25}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={handleBlur}
          className="min-h-[40px] sm:min-h-[32px] w-16 sm:w-20 text-right"
        />
      </td>
      <td className="p-2 sm:p-3 text-right align-middle">{formatCents(labor.line_total_cents)}</td>
      <td className="p-2 sm:p-3">
        <Button variant="destructive" size="sm" onClick={onDelete} className="min-h-[40px] sm:min-h-[32px]">
          删除
        </Button>
      </td>
    </tr>
  );
}
