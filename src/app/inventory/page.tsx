"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, ClipboardCheck, History, Search, Settings2, ShoppingCart, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import { InventoryImageInput } from "@/components/inventory-image-input";

type RawItem = {
  id: string; sku: string; name: string; category: string | null; unit: string;
  on_hand_qty: number; reserved_qty: number; avg_cost_cents: number;
  default_sale_price_cents: number; reorder_level: number; is_active: boolean;
  image_data_url: string | null;
  available_qty?: number; inventory_value_cents?: number; is_low_stock?: boolean;
};
type Item = RawItem & { available_qty: number; inventory_value_cents: number; is_low_stock: boolean };
type Movement = { id: string; type: string; qty_change: number; reserved_change: number; note: string | null; created_at: string };
type DetailTab = "maintenance" | "count" | "movements";
type InventoryFilter = "ALL" | "LOW" | "RESERVED" | "INACTIVE";

const emptyInbound = {
  mode: "existing" as "existing" | "new",
  inventoryItemId: "", sourceType: "INITIAL_STOCK", qty: "1", unitCost: "", reason: "",
  sku: "", name: "", category: "", unit: "个", salePrice: "", reorderLevel: "0", imageDataUrl: null as string | null,
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "操作失败"));
  return data as T;
}

function normalizeItem(item: RawItem): Item {
  const available = item.on_hand_qty - item.reserved_qty;
  return {
    ...item,
    available_qty: available,
    inventory_value_cents: item.on_hand_qty * item.avg_cost_cents,
    is_low_stock: available <= item.reorder_level,
  };
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("maintenance");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [countCost, setCountCost] = useState("");
  const [maintenance, setMaintenance] = useState({ name: "", category: "", unit: "个", sale: "", reorder: "0", imageDataUrl: null as string | null });
  const [inboundOpen, setInboundOpen] = useState(false);
  const [inbound, setInbound] = useState(emptyInbound);

  const load = async () => {
    try {
      const data = await json<{ items: RawItem[] }>("/api/inventory");
      setItems(data.items.map(normalizeItem));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "库存加载失败");
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selected && !inboundOpen) return;
    const oldOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (inboundOpen) setInboundOpen(false);
      else setSelected(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected, inboundOpen]);

  const totals = useMemo(() => ({
    value: items.reduce((sum, item) => sum + item.inventory_value_cents, 0),
    low: items.filter((item) => item.is_active && item.is_low_stock).length,
    reserved: items.reduce((sum, item) => sum + item.reserved_qty, 0),
    active: items.filter((item) => item.is_active).length,
  }), [items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !needle || `${item.sku} ${item.name} ${item.category ?? ""}`.toLowerCase().includes(needle);
      const matchesFilter = filter === "ALL" ||
        (filter === "LOW" && item.is_active && item.is_low_stock) ||
        (filter === "RESERVED" && item.reserved_qty > 0) ||
        (filter === "INACTIVE" && !item.is_active);
      return matchesQuery && matchesFilter;
    });
  }, [items, query, filter]);

  const openItem = async (item: Item, tab: DetailTab = "maintenance") => {
    setSelected(item);
    setDetailTab(tab);
    setCounted(String(item.on_hand_qty));
    setReason("");
    setCountCost("");
    setError("");
    setMaintenance({ name: item.name, category: item.category ?? "", unit: item.unit, sale: (item.default_sale_price_cents / 100).toFixed(2), reorder: String(item.reorder_level), imageDataUrl: item.image_data_url });
    try {
      const data = await json<{ movements: Movement[] }>(`/api/inventory/${item.id}/movements`);
      setMovements(data.movements);
    } catch (movementError) {
      setError(movementError instanceof Error ? movementError.message : "流水加载失败");
    }
  };

  const saveMaintenance = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const updated = await json<RawItem>(`/api/inventory/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: maintenance.name, category: maintenance.category || null, unit: maintenance.unit, default_sale_price_cents: Math.round((Number(maintenance.sale) || 0) * 100), reorder_level: Math.max(0, Number(maintenance.reorder) || 0), image_data_url: maintenance.imageDataUrl }),
      });
      setSelected(normalizeItem(updated));
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "维护失败"); }
    finally { setBusy(false); }
  };

  const toggleActive = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const updated = await json<RawItem>(`/api/inventory/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !selected.is_active }) });
      setSelected(normalizeItem(updated));
      await load();
    } catch (toggleError) { setError(toggleError instanceof Error ? toggleError.message : "维护失败"); }
    finally { setBusy(false); }
  };

  const count = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await json(`/api/inventory/${selected.id}/adjustment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counted_qty: Number(counted), reason, unit_cost_cents: countCost === "" ? undefined : Math.round(Number(countCost) * 100) }),
      });
      const data = await json<{ item: RawItem; movements: Movement[] }>(`/api/inventory/${selected.id}/movements`);
      setSelected(normalizeItem(data.item));
      setMovements(data.movements);
      setReason(""); setCountCost("");
      await load();
    } catch (countError) { setError(countError instanceof Error ? countError.message : "盘点失败"); }
    finally { setBusy(false); }
  };

  const submitOtherInbound = async () => {
    setBusy(true); setError("");
    try {
      await json("/api/inventory/other-inbound", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: inbound.mode === "existing" ? inbound.inventoryItemId : undefined,
          new_item: inbound.mode === "new" ? {
            sku: inbound.sku, name: inbound.name, category: inbound.category || undefined, unit: inbound.unit,
            default_sale_price_cents: Math.round((Number(inbound.salePrice) || 0) * 100),
            reorder_level: Math.max(0, Math.floor(Number(inbound.reorderLevel) || 0)),
            image_data_url: inbound.imageDataUrl,
          } : undefined,
          source_type: inbound.sourceType,
          qty: Number(inbound.qty),
          unit_cost_cents: Math.round((Number(inbound.unitCost) || 0) * 100),
          reason: inbound.reason,
        }),
      });
      setInboundOpen(false);
      setInbound(emptyInbound);
      await load();
    } catch (inboundError) { setError(inboundError instanceof Error ? inboundError.message : "其他入库失败"); }
    finally { setBusy(false); }
  };

  const typeLabel = (type: string) => ({ PURCHASE_RECEIPT: "采购入库", CASE_RESERVE: "维修预留", CASE_RELEASE: "释放预留", CASE_CONSUMPTION: "维修消耗", CASE_RETURN: "维修退回", COUNT_ADJUSTMENT: "盘点修正", MANUAL_ADJUSTMENT: "其他入库" })[type] ?? type;

  return (
    <div className="page-shell space-y-6">
      <div className="page-hero flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="section-eyebrow">维修部库存</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">库存管理</h1></div>
        <div className="relative z-10 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setInbound(emptyInbound); setError(""); setInboundOpen(true); }}><Boxes className="mr-2 size-4" />其他入库</Button>
          <Link href="/purchases" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"><ShoppingCart className="size-4" />去采购入库</Link>
        </div>
      </div>

      {error && !selected && !inboundOpen && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="surface-panel grid grid-cols-2 overflow-hidden sm:grid-cols-4">
        <div className="border-b border-r border-border/70 px-4 py-4 sm:border-b-0 sm:px-5">
          <div className="mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-foreground/45" /><p className="text-xs font-medium text-muted-foreground">启用商品</p></div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{totals.active}</p>
        </div>
        <div className="border-b border-border/70 px-4 py-4 sm:border-b-0 sm:border-r sm:px-5">
          <div className="mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /><p className="text-xs font-medium text-muted-foreground">库存价值</p></div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{formatCents(totals.value)}</p>
        </div>
        <div className="border-r border-border/70 px-4 py-4 sm:px-5">
          <div className="mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-amber-500" /><p className="text-xs font-medium text-muted-foreground">已预留</p></div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">{totals.reserved}</p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-2 flex items-center gap-2"><span className={`size-1.5 rounded-full ${totals.low > 0 ? "bg-red-500" : "bg-emerald-500"}`} /><p className="text-xs font-medium text-muted-foreground">低库存</p></div>
          <p className={`text-2xl font-semibold tabular-nums tracking-tight ${totals.low > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{totals.low}</p>
        </div>
      </div>

      <div className="surface-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="搜索 SKU、名称或分类" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1">
          {[["ALL", "全部"], ["LOW", "低库存"], ["RESERVED", "有预留"], ["INACTIVE", "已停用"]].map(([value, label]) => <button key={value} onClick={() => setFilter(value as InventoryFilter)} className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-all ${filter === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>)}
        </div>
      </div>

      <div className="space-y-3 sm:hidden">
        {visibleItems.map((item) => (
          <button key={item.id} type="button" onClick={() => openItem(item)} className="surface-panel w-full p-4 text-left active:scale-[0.99]">
            <div className="flex items-start gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                {item.image_data_url ? <img src={item.image_data_url} alt={item.name} className="h-full w-full object-cover" /> : <Boxes className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{item.name}</p><p className="truncate font-mono text-xs text-muted-foreground">{item.sku} · {item.unit}</p></div><span className={`shrink-0 text-xs font-semibold ${!item.is_active ? "text-muted-foreground" : item.is_low_stock ? "text-red-600" : "text-emerald-700"}`}>{!item.is_active ? "停用" : item.is_low_stock ? "低库存" : "正常"}</span></div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center"><div><p className="text-[11px] text-muted-foreground">现有</p><p className="font-semibold tabular-nums">{item.on_hand_qty}</p></div><div><p className="text-[11px] text-muted-foreground">可用</p><p className="font-semibold tabular-nums">{item.available_qty}</p></div><div><p className="text-[11px] text-muted-foreground">库存价值</p><p className="font-semibold tabular-nums">{formatCents(item.inventory_value_cents)}</p></div></div>
              </div>
            </div>
          </button>
        ))}
        {visibleItems.length === 0 && <div className="surface-panel p-10 text-center text-sm text-muted-foreground">当前筛选下没有库存商品</div>}
      </div>

      <div className="surface-panel hidden overflow-x-auto sm:block">
        <table className="data-table w-full min-w-[1050px] text-sm">
          <thead><tr className="border-b text-left"><th className="p-4">SKU / 商品</th><th className="p-4">分类</th><th className="p-4 text-right">现有</th><th className="p-4 text-right">预留</th><th className="p-4 text-right">可用</th><th className="p-4 text-right">平均成本</th><th className="p-4 text-right">库存价值</th><th className="p-4">状态</th><th className="p-4" /></tr></thead>
          <tbody>
            {visibleItems.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="p-4"><div className="flex items-center gap-3"><div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">{item.image_data_url ? <img src={item.image_data_url} alt={item.name} className="h-full w-full object-cover" /> : <Boxes className="size-5 text-muted-foreground" />}</div><div><p className="font-semibold">{item.name}</p><p className="font-mono text-xs text-muted-foreground">{item.sku} · {item.unit}</p></div></div></td><td className="p-4">{item.category ?? "-"}</td><td className="p-4 text-right font-medium">{item.on_hand_qty}</td><td className="p-4 text-right text-amber-700 dark:text-amber-300">{item.reserved_qty}</td><td className="p-4 text-right font-bold">{item.available_qty}</td><td className="p-4 text-right">{formatCents(item.avg_cost_cents)}</td><td className="p-4 text-right">{formatCents(item.inventory_value_cents)}</td><td className="p-4">{!item.is_active ? <span className="text-muted-foreground">停用</span> : item.is_low_stock ? <span className="text-red-600 dark:text-red-400">低库存</span> : <span className="text-emerald-700 dark:text-emerald-300">正常</span>}</td><td className="p-4"><Button variant="outline" onClick={() => openItem(item)}><Settings2 className="mr-2 size-4" />维护 / 盘点</Button></td></tr>)}
            {visibleItems.length === 0 && <tr><td colSpan={9} className="p-12 text-center text-muted-foreground">当前筛选下没有库存商品</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={`${selected.name} 库存管理`}>
          <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="关闭库存管理" onClick={() => setSelected(null)} />
          <div className="relative flex h-[100dvh] max-h-none w-full max-w-5xl flex-col overflow-hidden border bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4 border-b p-5 sm:p-6"><div><p className="font-mono text-xs font-semibold text-primary">{selected.sku}</p><h2 className="mt-1 text-2xl font-bold">{selected.name}</h2><p className="mt-1 text-sm text-muted-foreground">现有 {selected.on_hand_qty} {selected.unit} · 预留 {selected.reserved_qty} · 可用 {selected.available_qty}</p></div><button className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setSelected(null)} aria-label="关闭"><X className="size-4" /></button></div>
            <div className="flex gap-1 overflow-x-auto border-b bg-muted/30 p-2 sm:px-6">
              {[["maintenance", "资料维护", Settings2], ["count", "库存盘点", ClipboardCheck], ["movements", "库存流水", History]].map(([value, label, Icon]) => <button key={value as string} onClick={() => setDetailTab(value as DetailTab)} className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${detailTab === value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-4" />{label as string}</button>)}
            </div>
            <div className="overflow-y-auto p-5 sm:p-6">
              {error && <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
              {detailTab === "maintenance" && <div className="space-y-5"><div><h3 className="font-bold">商品资料</h3><p className="mt-1 text-sm text-muted-foreground">SKU 创建后保持不变，其他资料可以维护。</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">SKU（不可修改）</label><Input value={selected.sku} disabled /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">商品名称</label><Input value={maintenance.name} onChange={(event) => setMaintenance({ ...maintenance, name: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">分类</label><Input value={maintenance.category} onChange={(event) => setMaintenance({ ...maintenance, category: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">库存单位</label><Select value={maintenance.unit} onValueChange={(value) => setMaintenance({ ...maintenance, unit: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["个", "件", "套", "瓶", "箱", "升", "卷"].map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">默认销售价</label><Input type="number" min="0" step="0.01" value={maintenance.sale} onChange={(event) => setMaintenance({ ...maintenance, sale: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">低库存提醒</label><Input type="number" min="0" value={maintenance.reorder} onChange={(event) => setMaintenance({ ...maintenance, reorder: event.target.value })} /></div></div><InventoryImageInput value={maintenance.imageDataUrl} onChange={(imageDataUrl) => setMaintenance({ ...maintenance, imageDataUrl })} disabled={busy} /><div className="flex flex-wrap justify-between gap-3 border-t pt-5"><Button variant="outline" onClick={toggleActive} disabled={busy}>{selected.is_active ? "停用商品" : "重新启用"}</Button><Button onClick={saveMaintenance} disabled={busy || !maintenance.name.trim() || !maintenance.unit.trim()}>{busy ? "保存中..." : "保存商品资料"}</Button></div></div>}
              {detailTab === "count" && <div className="space-y-5"><div><h3 className="font-bold">库存盘点修正</h3><p className="mt-1 text-sm text-muted-foreground">盘点只用于实际数量与系统不一致的情况，正常进货请使用采购入库或其他入库。</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">系统现有</p><p className="mt-1 text-xl font-bold">{selected.on_hand_qty} {selected.unit}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">已预留</p><p className="mt-1 text-xl font-bold">{selected.reserved_qty} {selected.unit}</p></div><div className="rounded-xl bg-muted/55 p-4"><p className="text-xs text-muted-foreground">盘点差异</p><p className="mt-1 text-xl font-bold">{counted === "" ? "-" : `${Number(counted) - selected.on_hand_qty > 0 ? "+" : ""}${Number(counted) - selected.on_hand_qty}`}</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">实际盘点数量 *</label><Input type="number" min={selected.reserved_qty} value={counted} onChange={(event) => setCounted(event.target.value)} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">新增部分单位成本（仅盘盈时）</label><Input type="number" min="0" step="0.01" value={countCost} onChange={(event) => setCountCost(event.target.value)} placeholder="没有新增成本可留空" /></div><div className="space-y-1.5 sm:col-span-2"><label className="text-xs font-semibold text-muted-foreground">盘点原因 *</label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：2026 年 9 月月末盘点" /></div></div><div className="flex justify-end border-t pt-5"><Button onClick={count} disabled={busy || !reason.trim() || counted === "" || Number(counted) < selected.reserved_qty}>{busy ? "处理中..." : "确认盘点修正"}</Button></div></div>}
              {detailTab === "movements" && <div className="space-y-3"><div><h3 className="font-bold">最近库存流水</h3><p className="mt-1 text-sm text-muted-foreground">保留最近 100 条库存变化记录。</p></div>{movements.length === 0 ? <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">暂无库存流水</p> : movements.map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm"><div><p className="font-semibold">{typeLabel(movement.type)}</p><p className="mt-1 text-xs text-muted-foreground">{movement.note ?? "-"}</p></div><div className="text-right tabular-nums"><p className="font-semibold">库存 {movement.qty_change > 0 ? "+" : ""}{movement.qty_change}</p><p className="text-xs text-muted-foreground">预留 {movement.reserved_change > 0 ? "+" : ""}{movement.reserved_change} · {new Date(movement.created_at).toLocaleString("zh-CN")}</p></div></div>)}</div>}
            </div>
          </div>
        </div>
      )}

      {inboundOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="其他入库">
          <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="关闭其他入库" onClick={() => setInboundOpen(false)} />
          <div className="relative h-[100dvh] max-h-none w-full max-w-4xl overflow-y-auto border bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex items-center justify-between gap-4 border-b p-5 sm:p-6"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Boxes className="size-5" /></span><h2 className="text-xl font-bold">其他入库</h2></div><button className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted" onClick={() => setInboundOpen(false)} aria-label="关闭"><X className="size-4" /></button></div>
            <div className="space-y-5 p-5 sm:p-6">
              {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1"><button className={`min-h-10 rounded-lg text-sm font-semibold ${inbound.mode === "existing" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`} onClick={() => setInbound({ ...inbound, mode: "existing" })}>选择已有零件</button><button className={`min-h-10 rounded-lg text-sm font-semibold ${inbound.mode === "new" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`} onClick={() => setInbound({ ...inbound, mode: "new" })}>创建新零件并入库</button></div>
              {inbound.mode === "existing" ? <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">库存零件 *</label><Select value={inbound.inventoryItemId} onValueChange={(value) => setInbound({ ...inbound, inventoryItemId: value })}><SelectTrigger><SelectValue placeholder="按 SKU 或名称选择已有零件" /></SelectTrigger><SelectContent>{items.filter((item) => item.is_active).map((item) => <SelectItem key={item.id} value={item.id}><span className="flex items-center gap-2">{item.image_data_url ? <img src={item.image_data_url} alt="" className="size-7 rounded-md object-cover" /> : <span className="size-7 rounded-md bg-muted" />}<span>{item.sku} · {item.name}</span></span></SelectItem>)}</SelectContent></Select></div> : <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">SKU *</label><Input value={inbound.sku} onChange={(event) => setInbound({ ...inbound, sku: event.target.value })} placeholder="例如 LIGHT-001" /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">零件名称 *</label><Input value={inbound.name} onChange={(event) => setInbound({ ...inbound, name: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">分类</label><Input value={inbound.category} onChange={(event) => setInbound({ ...inbound, category: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">库存单位</label><Select value={inbound.unit} onValueChange={(value) => setInbound({ ...inbound, unit: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["个", "件", "套", "瓶", "箱", "升", "卷"].map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">默认销售价</label><Input type="number" min="0" step="0.01" value={inbound.salePrice} onChange={(event) => setInbound({ ...inbound, salePrice: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">低库存提醒</label><Input type="number" min="0" value={inbound.reorderLevel} onChange={(event) => setInbound({ ...inbound, reorderLevel: event.target.value })} /></div></div><InventoryImageInput value={inbound.imageDataUrl} onChange={(imageDataUrl) => setInbound({ ...inbound, imageDataUrl })} disabled={busy} /></div>}
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">入库来源 *</label><Select value={inbound.sourceType} onValueChange={(value) => setInbound({ ...inbound, sourceType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INITIAL_STOCK">期初库存</SelectItem><SelectItem value="REPAIR_RETURN">维修退回</SelectItem><SelectItem value="WAREHOUSE_TRANSFER">其他仓库调入</SelectItem><SelectItem value="GIFT_SAMPLE">赠品 / 样品</SelectItem><SelectItem value="OTHER">其他来源</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">入库数量 *</label><Input type="number" min="1" value={inbound.qty} onChange={(event) => setInbound({ ...inbound, qty: event.target.value })} /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">单位成本 USD *</label><Input type="number" min="0" step="0.01" value={inbound.unitCost} onChange={(event) => setInbound({ ...inbound, unitCost: event.target.value })} placeholder="赠品可填写 0" /></div><div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">入库原因 / 凭证 *</label><Input value={inbound.reason} onChange={(event) => setInbound({ ...inbound, reason: event.target.value })} placeholder="例如：系统上线期初盘点，凭证 #001" /></div></div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-muted/25 p-5 sm:p-6"><Button variant="outline" onClick={() => setInboundOpen(false)}>取消</Button><Button disabled={busy || (inbound.mode === "existing" ? !inbound.inventoryItemId : !inbound.sku.trim() || !inbound.name.trim()) || Number(inbound.qty) <= 0 || inbound.unitCost === "" || !inbound.reason.trim()} onClick={submitOtherInbound}>{busy ? "入库中..." : "确认其他入库"}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}
