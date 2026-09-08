"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api-error";
import { InventoryImageInput } from "@/components/inventory-image-input";

type Item = { id: string; sku: string; name: string; unit: string; is_active: boolean; image_data_url: string | null };
type Line = { inventory_item_id: string; qty: string; unit_cost: string };
type NewItemForm = { sku: string; name: string; category: string; unit: string; salePrice: string; reorderLevel: string; imageDataUrl: string | null };
type Order = {
  id: string;
  purchase_number: string;
  supplier: string;
  purchase_date: string;
  status: string;
  total_cents: number;
  lines: Array<{ id: string; name_snapshot: string; qty: number; unit_cost_cents: number; inventory_item?: { unit: string } }>;
};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, "操作失败"));
  return data as T;
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyNewItem: NewItemForm = { sku: "", name: "", category: "", unit: "个", salePrice: "", reorderLevel: "0", imageDataUrl: null };

export default function PurchasesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(() => localDateValue(new Date()));
  const [additional, setAdditional] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ inventory_item_id: "", qty: "1", unit_cost: "" }]);
  const [newItemForLine, setNewItemForLine] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<NewItemForm>(emptyNewItem);
  const [newItemError, setNewItemError] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [inventory, purchases] = await Promise.all([
        json<{ items: Item[] }>("/api/inventory"),
        json<{ orders: Order[] }>("/api/purchases"),
      ]);
      setItems(inventory.items.filter((item) => item.is_active));
      setOrders(purchases.orders);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "采购数据加载失败");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (newItemForLine === null) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNewItemForLine(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [newItemForLine]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * Math.round((Number(line.unit_cost) || 0) * 100), 0),
    [lines],
  );
  const updateLine = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));

  const openNewItem = (index: number) => {
    setNewItemForLine(index);
    setNewItem(emptyNewItem);
    setNewItemError("");
  };

  const openNewItemFromHeader = () => {
    const emptyLineIndex = lines.findIndex((line) => !line.inventory_item_id);
    if (emptyLineIndex >= 0) {
      openNewItem(emptyLineIndex);
      return;
    }
    const newLineIndex = lines.length;
    setLines((current) => [...current, { inventory_item_id: "", qty: "1", unit_cost: "" }]);
    openNewItem(newLineIndex);
  };

  const createInventoryItem = async () => {
    if (newItemForLine === null || !newItem.sku.trim() || !newItem.name.trim() || !newItem.unit.trim()) return;
    setCreatingItem(true);
    setNewItemError("");
    try {
      const created = await json<Item>("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newItem.sku.trim(),
          name: newItem.name.trim(),
          category: newItem.category.trim() || undefined,
          unit: newItem.unit.trim(),
          default_sale_price_cents: Math.round((Number(newItem.salePrice) || 0) * 100),
          reorder_level: Math.max(0, Math.floor(Number(newItem.reorderLevel) || 0)),
          image_data_url: newItem.imageDataUrl,
        }),
      });
      setItems((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
      updateLine(newItemForLine, { inventory_item_id: created.id });
      setNewItemForLine(null);
      setNewItem(emptyNewItem);
    } catch (itemError) {
      setNewItemError(itemError instanceof Error ? itemError.message : "新增零件失败");
    } finally {
      setCreatingItem(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      await json("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          purchase_date: new Date(`${date}T12:00:00`).toISOString(),
          additional_cost_cents: Math.round((Number(additional) || 0) * 100),
          notes: notes || undefined,
          lines: lines.map((line) => ({
            inventory_item_id: line.inventory_item_id,
            qty: Number(line.qty),
            unit_cost_cents: Math.round((Number(line.unit_cost) || 0) * 100),
          })),
        }),
      });
      setSupplier("");
      setAdditional("");
      setNotes("");
      setLines([{ inventory_item_id: "", qty: "1", unit_cost: "" }]);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "采购单创建失败");
    } finally {
      setBusy(false);
    }
  };

  const action = async (id: string, type: "receive" | "cancel") => {
    setBusy(true);
    setError("");
    try {
      await json(`/api/purchases/${id}/${type}`, { method: "POST" });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const status = (value: string) => ({ DRAFT: "草稿", RECEIVED: "已入库", CANCELED: "已取消" })[value] ?? value;

  return (
    <div className="page-shell space-y-6">
      <div className="page-hero">
        <p className="section-eyebrow">维修部采购</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">采购入库</h1>
      </div>
      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <Card className="overflow-visible">
        <CardContent className="p-0">
          <section className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">1</span>
              <h2 className="self-center text-lg font-bold">采购单信息</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">供应商 *</label><Input placeholder="例如 ABC Auto Parts" value={supplier} onChange={(event) => setSupplier(event.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">采购日期 *</label><DatePicker value={date} onChange={setDate} ariaLabel="选择采购日期" /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">附加费用（可选）</label><Input type="number" min="0" step="0.01" placeholder="运费、手续费等" value={additional} onChange={(event) => setAdditional(event.target.value)} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">备注（可选）</label><Input placeholder="Receipt 编号或其他说明" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            </div>
          </section>

          <section className="border-t border-border p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">2</span>
                <h2 className="self-center text-lg font-bold">采购零件</h2>
              </div>
              <Button variant="outline" onClick={openNewItemFromHeader}><PackagePlus className="mr-2 size-4" />新建零件</Button>
            </div>

            <div className="hidden grid-cols-[minmax(300px,1fr)_120px_170px_140px_44px] gap-3 px-3 pb-2 text-xs font-semibold text-muted-foreground lg:grid">
              <span>库存零件</span><span>采购数量</span><span>单位采购成本</span><span className="text-right">本行小计</span><span />
            </div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="rounded-2xl border border-border/80 bg-muted/15 p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(300px,1fr)_120px_170px_140px_44px] lg:items-start">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-muted-foreground lg:hidden">库存零件</label>
                      <Select value={line.inventory_item_id} onValueChange={(value) => updateLine(index, { inventory_item_id: value })}>
                        <SelectTrigger><SelectValue placeholder="按 SKU 或名称选择已有零件" /></SelectTrigger>
                        <SelectContent>{items.map((item) => <SelectItem key={item.id} value={item.id}><span className="flex items-center gap-2">{item.image_data_url ? <img src={item.image_data_url} alt="" className="size-7 rounded-md object-cover" /> : <span className="size-7 rounded-md bg-muted" />}<span>{item.sku} · {item.name}</span></span></SelectItem>)}</SelectContent>
                      </Select>
                      <button type="button" onClick={() => openNewItem(index)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary/10"><PackagePlus className="size-3.5" />新建零件</button>
                    </div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground lg:hidden">采购数量</label><Input type="number" min="1" placeholder="数量" value={line.qty} onChange={(event) => updateLine(index, { qty: event.target.value })} /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground lg:hidden">单位采购成本</label><Input type="number" min="0" step="0.01" placeholder="USD" value={line.unit_cost} onChange={(event) => updateLine(index, { unit_cost: event.target.value })} /></div>
                    <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground lg:hidden">本行小计</label><div className="flex min-h-11 items-center justify-end rounded-xl bg-muted/70 px-3 text-sm font-bold tabular-nums">{formatCents((Number(line.qty) || 0) * Math.round((Number(line.unit_cost) || 0) * 100))}</div></div>
                    <button type="button" aria-label={`删除第 ${index + 1} 行`} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))} className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setLines([...lines, { inventory_item_id: "", qty: "1", unit_cost: "" }])} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"><Plus className="size-4" />添加一行</button>
          </section>

          <section className="border-t border-border bg-muted/20 p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">3</span><h2 className="text-lg font-bold">金额合计</h2></div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[610px]">
                <div className="rounded-xl border bg-card/70 px-4 py-3"><p className="text-xs text-muted-foreground">零件金额</p><p className="mt-1 font-bold tabular-nums">{formatCents(subtotal)}</p></div>
                <div className="rounded-xl border bg-card/70 px-4 py-3"><p className="text-xs text-muted-foreground">附加费用</p><p className="mt-1 font-bold tabular-nums">{formatCents(Math.round((Number(additional) || 0) * 100))}</p></div>
                <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3"><p className="text-xs font-medium text-primary">采购总额</p><p className="mt-1 text-xl font-bold tabular-nums">{formatCents(subtotal + Math.round((Number(additional) || 0) * 100))}</p></div>
              </div>
              <Button className="min-h-12 px-6" disabled={busy || !supplier.trim() || lines.some((line) => !line.inventory_item_id || Number(line.qty) <= 0 || line.unit_cost === "" || Number(line.unit_cost) < 0)} onClick={create}><FileText className="mr-2 size-4" />{busy ? "保存中..." : "保存采购草稿"}</Button>
            </div>
          </section>
        </CardContent>
      </Card>

      {newItemForLine !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="创建新零件">
          <button type="button" aria-label="关闭弹窗" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={() => setNewItemForLine(null)} />
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-5 sm:p-6">
              <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><PackagePlus className="size-5" /></span><h2 className="text-xl font-bold">新建零件</h2></div>
              <button type="button" aria-label="关闭新增零件" onClick={() => setNewItemForLine(null)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">SKU *</label><Input placeholder="例如 LIGHT-001" value={newItem.sku} onChange={(event) => setNewItem({ ...newItem, sku: event.target.value })} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">零件名称 *</label><Input placeholder="例如 前大灯总成" value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">分类</label><Input placeholder="例如 灯具" value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">库存单位 *</label><Select value={newItem.unit} onValueChange={(value) => setNewItem({ ...newItem, unit: value })}><SelectTrigger><SelectValue placeholder="选择单位" /></SelectTrigger><SelectContent><SelectItem value="个">个</SelectItem><SelectItem value="件">件</SelectItem><SelectItem value="套">套</SelectItem><SelectItem value="瓶">瓶</SelectItem><SelectItem value="箱">箱</SelectItem><SelectItem value="升">升</SelectItem><SelectItem value="卷">卷</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">最低库存提醒</label><Input type="number" min="0" value={newItem.reorderLevel} onChange={(event) => setNewItem({ ...newItem, reorderLevel: event.target.value })} /></div>
              <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">默认销售价（可选）</label><Input type="number" min="0" step="0.01" placeholder="向客户报价的参考价" value={newItem.salePrice} onChange={(event) => setNewItem({ ...newItem, salePrice: event.target.value })} /></div>
              <div className="sm:col-span-2"><InventoryImageInput value={newItem.imageDataUrl} onChange={(imageDataUrl) => setNewItem({ ...newItem, imageDataUrl })} disabled={creatingItem} /></div>
            </div>
            <div className="flex flex-col gap-3 border-t bg-muted/25 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div>{newItemError && <p className="text-sm text-destructive">{newItemError}</p>}</div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setNewItemForLine(null)}>取消</Button><Button disabled={creatingItem || !newItem.sku.trim() || !newItem.name.trim() || !newItem.unit.trim()} onClick={createInventoryItem}>{creatingItem ? "创建中..." : "创建并选中当前行"}</Button></div>
            </div>
          </div>
        </div>
      )}

      <section className="surface-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-bold">采购记录</h2>
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{orders.length}</span>
        </div>
        {orders.length === 0 ? <div className="p-10 text-center text-muted-foreground">暂无采购单</div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="border-b border-border/70 bg-muted/35 text-left text-xs font-semibold text-muted-foreground">
                <tr><th className="px-5 py-3 sm:px-6">供应商 / 采购单</th><th className="px-4 py-3">日期</th><th className="px-4 py-3">状态</th><th className="px-4 py-3 text-right">零件</th><th className="px-4 py-3 text-right">采购总额</th><th className="px-5 py-3 text-right sm:px-6">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {orders.map((order) => (
                  <tr key={order.id} className="group transition-colors hover:bg-muted/20">
                    <td className="px-5 py-4 sm:px-6"><p className="font-semibold">{order.supplier}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground">{order.purchase_number}</p></td>
                    <td className="px-4 py-4 tabular-nums text-muted-foreground">{new Date(order.purchase_date).toLocaleDateString("zh-CN")}</td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center gap-2 font-medium ${order.status === "RECEIVED" ? "text-emerald-700 dark:text-emerald-300" : order.status === "CANCELED" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}><span className="size-1.5 rounded-full bg-current" />{status(order.status)}</span></td>
                    <td className="px-4 py-4 text-right tabular-nums">{order.lines.length}</td>
                    <td className="px-4 py-4 text-right text-base font-bold tabular-nums">{formatCents(order.total_cents)}</td>
                    <td className="px-5 py-4 sm:px-6"><div className="flex items-center justify-end gap-2">{order.status === "DRAFT" && <><Button size="sm" variant="ghost" disabled={busy} onClick={() => action(order.id, "cancel")}>取消</Button><Button size="sm" disabled={busy} onClick={() => action(order.id, "receive")}>确认入库</Button></>}<Button size="sm" variant="outline" onClick={() => setSelectedOrderId(order.id)}><Eye className="mr-1.5 size-3.5" />查看</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedOrderId && (() => {
        const order = orders.find((item) => item.id === selectedOrderId);
        if (!order) return null;
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="采购单详情">
            <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedOrderId(null)} aria-label="关闭采购单详情" />
            <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6"><div><div className="flex flex-wrap items-center gap-2.5"><h2 className="text-xl font-bold">{order.supplier}</h2><span className={`inline-flex items-center gap-2 text-sm font-medium ${order.status === "RECEIVED" ? "text-emerald-700 dark:text-emerald-300" : order.status === "CANCELED" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}`}><span className="size-1.5 rounded-full bg-current" />{status(order.status)}</span></div><p className="mt-1 font-mono text-sm text-muted-foreground">{order.purchase_number}</p></div><button type="button" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setSelectedOrderId(null)} aria-label="关闭"><X className="size-4" /></button></div>
              <div className="grid grid-cols-2 gap-4 border-b border-border bg-muted/20 p-5 sm:grid-cols-3 sm:p-6"><div><p className="text-xs text-muted-foreground">采购日期</p><p className="mt-1 font-semibold">{new Date(order.purchase_date).toLocaleDateString("zh-CN")}</p></div><div><p className="text-xs text-muted-foreground">零件数量</p><p className="mt-1 font-semibold">{order.lines.length} 项</p></div><div className="col-span-2 sm:col-span-1 sm:text-right"><p className="text-xs text-muted-foreground">采购总额</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatCents(order.total_cents)}</p></div></div>
              <div className="p-5 sm:p-6"><div className="overflow-hidden rounded-xl border border-border"><div className="hidden grid-cols-[minmax(0,1fr)_100px_170px_160px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground sm:grid"><span>零件名称</span><span className="text-right">数量</span><span className="text-right">单位成本</span><span className="text-right">小计</span></div><div className="divide-y divide-border/60">{order.lines.map((line) => <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_100px_170px_160px] sm:gap-4"><p className="font-medium">{line.name_snapshot}</p><p className="text-right tabular-nums">{line.qty}</p><p className="hidden text-right tabular-nums text-muted-foreground sm:block">{formatCents(line.unit_cost_cents)} / {line.inventory_item?.unit ?? "单位"}</p><p className="hidden text-right font-semibold tabular-nums sm:block">{formatCents(line.qty * line.unit_cost_cents)}</p></div>)}</div></div></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
