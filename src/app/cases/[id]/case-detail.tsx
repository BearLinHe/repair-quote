"use client";

import { useEffect, useRef, useState } from "react";
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
import { canEditCaseDetails } from "@/lib/case-rules";
import { apiErrorMessage } from "@/lib/api-error";

type LaborRow = {
  id: string;
  name: string;
  hours: number;
  rate_cents: number;
  line_total_cents: number;
};

type CaseData = {
  id: string;
  invoice_number: string;
  plate: string | null;
  vin: string | null;
  unit_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  bill_to_company: string | null;
  bill_to_address: string | null;
  bill_to_contact: string | null;
  status: CaseStatus;
  parts_subtotal_cents: number;
  labor_subtotal_cents: number;
  cleaning_fee_cents: number;
  apply_cleaning: boolean;
  apply_tax: boolean;
  tax_cents: number;
  grand_total_cents: number;
  draft_data: unknown;
  draft_updated_at: string | null;
  repair_items: Array<{ id: string; name: string; sort_order: number }>;
  parts: Array<{ id: string; name: string; unit_price_cents: number; qty: number; line_total_cents: number; inventory_item_id: string | null; cost_total_cents: number }>;
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

type DraftTab = "items" | "parts" | "labor" | "summary";

type CaseDraft = {
  active_tab?: DraftTab;
  repair_item_name?: string;
  selected_inventory_id?: string;
  part_price?: string;
  part_qty?: string;
  labor_name?: string;
  labor_hours?: string;
  labor_rate?: string;
  status_note?: string;
};

function normalizeDraft(value: unknown): CaseDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CaseDraft;
}

type History = {
  repair_item_names: string[];
  labor_templates: Array<{ name: string; last_rate_cents: number }>;
};

type InventoryOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  available_qty: number;
  default_sale_price_cents: number;
  is_active: boolean;
  image_data_url: string | null;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, response.status === 401 ? "登录已失效，请重新登录" : "操作失败"));
  }
  return data as T;
}

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
  const initialDraft = normalizeDraft(caseData.draft_data);
  const [caseState, setCaseState] = useState(caseData);
  const [history, setHistory] = useState<History | null>(null);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState(initialDraft.selected_inventory_id ?? "");
  const [newItemName, setNewItemName] = useState(initialDraft.repair_item_name ?? "");
  const [newPartPrice, setNewPartPrice] = useState(initialDraft.part_price ?? "");
  const [newPartQty, setNewPartQty] = useState(initialDraft.part_qty ?? "1");
  const [newLaborName, setNewLaborName] = useState(initialDraft.labor_name ?? "");
  const [newLaborHours, setNewLaborHours] = useState(initialDraft.labor_hours ?? "");
  const [newLaborRate, setNewLaborRate] = useState(initialDraft.labor_rate ?? "");
  const [statusNote, setStatusNote] = useState(initialDraft.status_note ?? "");
  const [billToCompany, setBillToCompany] = useState(caseData.bill_to_company ?? "");
  const [billToAddress, setBillToAddress] = useState(caseData.bill_to_address ?? "");
  const [billToContact, setBillToContact] = useState(caseData.bill_to_contact ?? "");
  const [activeTab, setActiveTab] = useState<DraftTab>(initialDraft.active_tab ?? "items");
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    caseData.draft_updated_at ? "saved" : "idle"
  );
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(
    caseData.draft_updated_at ? new Date(caseData.draft_updated_at) : null
  );
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const didMountDraft = useRef(false);
  const latestDraftRef = useRef<CaseDraft>(initialDraft);
  const canSaveDraftRef = useRef(false);

  const caseId = caseData.id;

  const refreshCase = async () => {
    const data = await requestJson<CaseData>(`/api/cases/${caseId}`);
    setCaseState(data);
  };

  const performAction = async (action: () => Promise<void>) => {
    setLoading(true);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const toggleTax = async (apply_tax: boolean) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_tax }),
      });
      await refreshCase();
    });
  };

  const toggleCleaning = async (apply_cleaning: boolean) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_cleaning }),
      });
      await refreshCase();
    });
  };

  const saveBillTo = async () => {
    if (!billToCompany.trim()) {
      setActionError("请填写 Bill To 公司名称");
      return;
    }
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bill_to_company: billToCompany.trim(),
          bill_to_address: billToAddress.trim() || null,
          bill_to_contact: billToContact.trim() || null,
        }),
      });
      await refreshCase();
    });
  };

  useEffect(() => {
    requestJson<History>(`/api/cases/${caseId}/history`)
      .then((data) => setHistory(data))
      .catch((error) => setActionError(error instanceof Error ? error.message : "历史数据加载失败"));
  }, [caseId]);

  useEffect(() => {
    requestJson<{ items: InventoryOption[] }>("/api/inventory")
      .then((data) => setInventory(data.items.filter((item) => item.is_active)))
      .catch((error) => setActionError(error instanceof Error ? error.message : "库存加载失败"));
  }, []);

  const addRepairItem = async (name: string) => {
    if (!name.trim()) return;
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/repair-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      await refreshCase();
      setNewItemName("");
    });
  };

  const updateRepairItem = async (itemId: string, name: string) => {
    if (!name.trim()) return;
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/repair-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, name: name.trim() }),
      });
      await refreshCase();
    });
  };

  const deleteRepairItem = async (itemId: string) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/repair-items?id=${itemId}`, { method: "DELETE" });
      await refreshCase();
    });
  };

  const addPart = async (unit_price_cents: number, qty: number, inventory_item_id: string) => {
    const selectedItem = inventory.find((item) => item.id === inventory_item_id);
    if (!selectedItem) {
      setActionError("请先从库存选择配件");
      return;
    }
    if (!Number.isFinite(unit_price_cents) || unit_price_cents < 0) {
      setActionError("请输入正确的本单售价");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setActionError("配件数量必须是大于 0 的整数");
      return;
    }
    if (qty > selectedItem.available_qty) {
      setActionError(`库存不足，当前最多可用 ${selectedItem.available_qty} ${selectedItem.unit}`);
      return;
    }
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/parts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_price_cents, qty, inventory_item_id }),
      });
      await refreshCase();
      setNewPartPrice("");
      setNewPartQty("1");
      setSelectedInventoryId("");
      const inventoryData = await requestJson<{ items: InventoryOption[] }>("/api/inventory");
      setInventory(inventoryData.items.filter((item) => item.is_active));
    });
  };

  const updatePart = async (
    partId: string,
    unit_price_cents: number,
    qty: number
  ) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/parts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: partId, unit_price_cents, qty }),
      });
      await refreshCase();
    });
  };

  const deletePart = async (partId: string) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/parts?id=${partId}`, { method: "DELETE" });
      await refreshCase();
    });
  };

  const addLabor = async (name: string, hours: number, rate_cents: number) => {
    if (!name.trim() || hours < 0 || rate_cents < 0) return;
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/labor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), hours, rate_cents }),
      });
      await refreshCase();
      setNewLaborName("");
      setNewLaborHours("");
      setNewLaborRate("");
    });
  };

  const updateLabor = async (
    laborId: string,
    name: string,
    hours: number,
    rate_cents: number
  ) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/labor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: laborId, name, hours, rate_cents }),
      });
      await refreshCase();
    });
  };

  const deleteLabor = async (laborId: string) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/labor?id=${laborId}`, { method: "DELETE" });
      await refreshCase();
    });
  };

  const changeStatus = async (to_status: CaseStatus) => {
    await performAction(async () => {
      await requestJson(`/api/cases/${caseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_status, note: statusNote || undefined }),
      });
      await refreshCase();
      setStatusNote("");
    });
  };

  const downloadPdf = async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/pdf`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setActionError(apiErrorMessage(err, "生成 PDF 失败"));
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
      setActionError("生成或下载 PDF 时出错");
    }
  };

  const status = caseState.status;
  const canSubmitToProgress = status === "SUBMITTED";
  const canSubmitToCancel = status === "SUBMITTED";
  const canProgressToComplete = status === "IN_PROGRESS";
  const canProgressToCancel = status === "IN_PROGRESS";
  const isFinal = status === "CANCELED" || status === "COMPLETED";
  /** 仅「进行中」时可编辑维修项目、配件、人工；已提交未开始做单时仅可查看 */
  const canEditDetails = canEditCaseDetails(status);
  const draftPayload: CaseDraft = {
    active_tab: activeTab,
    repair_item_name: newItemName,
    selected_inventory_id: selectedInventoryId,
    part_price: newPartPrice,
    part_qty: newPartQty,
    labor_name: newLaborName,
    labor_hours: newLaborHours,
    labor_rate: newLaborRate,
    status_note: statusNote,
  };
  latestDraftRef.current = draftPayload;
  canSaveDraftRef.current = canEditDetails;

  useEffect(() => {
    if (!canEditDetails) return;
    if (!didMountDraft.current) {
      didMountDraft.current = true;
      return;
    }

    const controller = new AbortController();
    setDraftSaveStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_data: draftPayload }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("SAVE_FAILED");
        setDraftSaveStatus("saved");
        setDraftSavedAt(new Date());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDraftSaveStatus("error");
        }
      }
    }, 600);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeTab,
    canEditDetails,
    caseId,
    newItemName,
    newLaborHours,
    newLaborName,
    newLaborRate,
    newPartPrice,
    newPartQty,
    selectedInventoryId,
    statusNote,
  ]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      if (!canSaveDraftRef.current) return;
      void fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_data: latestDraftRef.current }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      saveBeforeLeaving();
    };
  }, [caseId]);

  const statusLabel = (s: CaseStatus) =>
    ({ SUBMITTED: "已提交", IN_PROGRESS: "进行中", CANCELED: "已取消", COMPLETED: "已完成" })[s] ?? s;
  const statusClass =
    ({
      SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-600/20",
      IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-600/20",
      COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
      CANCELED: "bg-slate-100 text-slate-600 ring-slate-500/20",
    } as const)[status];

  return (
    <div className="space-y-6 pb-8 sm:space-y-8">
      <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">车辆与司机</CardTitle>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusClass}`}>
              {statusLabel(status)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 text-sm sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice Number</p><p className="mt-1 font-semibold tabular-nums">{caseState.invoice_number}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">车牌</p><p className="mt-1 font-semibold">{caseState.plate ?? "-"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">车架号</p><p className="mt-1 break-all font-medium">{caseState.vin ?? "-"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">车号</p><p className="mt-1 font-medium">{caseState.unit_number ?? "-"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">当前总价</p><p className="mt-1 text-lg font-bold tabular-nums text-primary">{formatCents(caseState.grand_total_cents)}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">司机</p><p className="mt-1 font-medium">{caseState.customer_name ?? "-"}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">联系电话</p><p className="mt-1 font-medium">{caseState.customer_phone ?? "-"}</p></div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30 p-5 sm:p-6">
          <CardTitle className="text-lg">Bill To</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 p-5 text-sm sm:grid-cols-2 sm:p-6 lg:grid-cols-[1fr_1fr_1.5fr_auto] lg:items-end">
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">公司名称 *</label>
            <Input value={billToCompany} onChange={(event) => setBillToCompany(event.target.value)} disabled={status === "CANCELED"} />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">负责人</label>
            <Input value={billToContact} onChange={(event) => setBillToContact(event.target.value)} disabled={status === "CANCELED"} />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">地址</label>
            <Input value={billToAddress} onChange={(event) => setBillToAddress(event.target.value)} disabled={status === "CANCELED"} />
          </div>
          {status !== "CANCELED" && <Button onClick={saveBillTo} disabled={loading || !billToCompany.trim()}>保存</Button>}
        </CardContent>
      </Card>

      <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">做单进度</p>
        {canEditDetails && (
          <p
            className={`text-xs ${draftSaveStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}
            aria-live="polite"
          >
            {draftSaveStatus === "saving" && "正在自动保存…"}
            {draftSaveStatus === "saved" && `已自动保存${draftSavedAt ? ` · ${draftSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : ""}`}
            {draftSaveStatus === "error" && "草稿保存失败，请检查网络"}
            {draftSaveStatus === "idle" && "输入内容会自动保存"}
          </p>
        )}
      </div>
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
      {actionError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}
      {!isFinal && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <Input
            placeholder="状态变更备注 (可选)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            className="flex-1 min-h-[44px] sm:min-h-[40px] max-w-full sm:max-w-xs"
          />
        </div>
      )}
      </div>

      <Card className="rounded-2xl border-border/80 shadow-sm">
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DraftTab)} className="w-full">
        <TabsList className="w-full flex overflow-x-auto shrink-0 gap-1 p-1 min-h-[44px] sm:min-h-[40px]">
          <TabsTrigger value="items" className="flex-1 min-w-0 shrink-0 text-sm">维修项目</TabsTrigger>
          <TabsTrigger value="parts" className="flex-1 min-w-0 shrink-0 text-sm">配件</TabsTrigger>
          <TabsTrigger value="labor" className="flex-1 min-w-0 shrink-0 text-sm">人工</TabsTrigger>
          <TabsTrigger value="summary" className="flex-1 min-w-0 shrink-0 text-sm">合计</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="space-y-4 mt-4">
          {canEditDetails && (
            <div className="max-w-4xl rounded-xl border border-border/70 bg-card/50 p-4">
              <div className="mb-3">
                <p className="font-semibold">添加维修项目</p>
                <p className="mt-1 text-xs text-muted-foreground">填写本次需要完成的维修内容，例如更换轮胎、检查刹车。</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(260px,1fr)_220px_auto] sm:items-end">
                <div className="grid gap-1">
                  <label className="text-sm font-medium text-muted-foreground">项目名称</label>
                  <Input
                    placeholder="输入维修项目"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="min-h-[44px] w-full sm:min-h-[40px]"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm font-medium text-muted-foreground">快速填充（可选）</label>
                  <Select onValueChange={setNewItemName} value="">
                    <SelectTrigger className="min-h-[44px] w-full sm:min-h-[40px]">
                      <SelectValue placeholder="从历史项目选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {history?.repair_item_names?.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => addRepairItem(newItemName)}
                  disabled={loading || !newItemName.trim()}
                  className="min-h-[44px] w-full whitespace-nowrap sm:min-h-[40px] sm:w-auto"
                >
                  {loading ? "添加中…" : "添加项目"}
                </Button>
              </div>
            </div>
          )}
          <div className="max-w-4xl space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">已添加项目</h3>
              <span className="text-xs text-muted-foreground">共 {caseState.repair_items.length} 项</span>
            </div>
            {caseState.repair_items.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">暂未添加维修项目</div>
            )}
            <ul className="space-y-2">
            {caseState.repair_items.map((item, index) => (
              <li key={item.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/70 bg-card p-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
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
                      className="min-h-[44px] min-w-0 sm:min-h-[40px]"
                    />
                    <Button variant="destructive" size="sm" onClick={() => deleteRepairItem(item.id)} className="min-h-[44px] sm:min-h-[36px]">
                      删除
                    </Button>
                  </>
                )}
              </li>
            ))}
            </ul>
          </div>
        </TabsContent>
        <TabsContent value="parts" className="space-y-4 mt-4">
          {canEditDetails && (
          <div className="grid gap-3 rounded-xl border border-border/70 bg-card/50 p-4 sm:grid-cols-[minmax(260px,1.7fr)_minmax(190px,1fr)_120px_auto] sm:items-start">
            <div className="grid min-w-0 gap-1">
              <label className="text-sm font-medium text-muted-foreground">从库存选择</label>
              <Select
                value={selectedInventoryId}
                onValueChange={(value) => {
                  setSelectedInventoryId(value);
                  const item = inventory.find((option) => option.id === value);
                  if (item) {
                    setNewPartPrice((item.default_sale_price_cents / 100).toFixed(2));
                    setNewPartQty("1");
                  }
                }}
              >
                <SelectTrigger className="min-h-[44px] w-full sm:min-h-[40px]">
                  <SelectValue placeholder="选择库存配件" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map((item) => (
                    <SelectItem key={item.id} value={item.id} disabled={item.available_qty <= 0}>
                      <span className="flex items-center gap-2">{item.image_data_url ? <img src={item.image_data_url} alt="" className="size-7 rounded-md object-cover" /> : <span className="size-7 rounded-md bg-muted" />}<span>{item.sku} · {item.name}（可用 {item.available_qty} {item.unit}）</span></span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="min-h-5 text-xs text-muted-foreground">
                {selectedInventoryId
                  ? `当前可用 ${inventory.find((item) => item.id === selectedInventoryId)?.available_qty ?? 0} ${inventory.find((item) => item.id === selectedInventoryId)?.unit ?? "个"}`
                  : "只能选择当前有可用库存的配件"}
              </p>
            </div>
            <div className="grid min-w-0 gap-1">
              <label className="text-sm font-medium text-muted-foreground">本单售价（默认建议价，可修改）</label>
              <Input
                type="number"
                step={0.01}
                placeholder="0.00"
                value={newPartPrice}
                onChange={(e) => setNewPartPrice(e.target.value)}
                className="min-h-[44px] w-full sm:min-h-[40px]"
              />
              <p className="min-h-5 text-xs text-muted-foreground">
                {selectedInventoryId
                  ? `建议售价 ${formatCents(inventory.find((item) => item.id === selectedInventoryId)?.default_sale_price_cents ?? 0)}`
                  : "选择配件后自动带入"}
              </p>
            </div>
            <div className="grid min-w-0 gap-1">
              <label className="text-sm font-medium text-muted-foreground">数量</label>
              <Input
                type="number"
                min={1}
                placeholder="1"
                value={newPartQty}
                onChange={(e) => setNewPartQty(e.target.value)}
                className="min-h-[44px] w-full sm:min-h-[40px]"
              />
              <p className="min-h-5 text-xs text-muted-foreground">默认 1 个</p>
            </div>
            <div className="grid min-w-0 gap-1">
              <span className="text-sm font-medium text-transparent" aria-hidden="true">操作</span>
              <Button
                onClick={() =>
                  addPart(
                    Math.round(Number(newPartPrice) * 100),
                    Number(newPartQty),
                    selectedInventoryId
                  )
                }
                disabled={loading || !selectedInventoryId || newPartPrice === ""}
                className="min-h-[44px] w-full whitespace-nowrap sm:min-h-[40px]"
              >
                {loading ? "新增中…" : "新增配件"}
              </Button>
              <span className="min-h-5" aria-hidden="true" />
            </div>
          </div>
          )}
          {actionError && activeTab === "parts" && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          )}
          <div className="-mx-1 overflow-x-auto rounded-lg border border-border px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[680px] table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                {canEditDetails && <col className="w-[10%]" />}
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">名称</th>
                  <th className="p-3 text-right font-medium">单价（USD）</th>
                  <th className="p-3 text-right font-medium">数量</th>
                  <th className="p-3 text-right font-medium">小计</th>
                  {canEditDetails && <th className="p-3" aria-label="操作"></th>}
                </tr>
              </thead>
              <tbody>
                {caseState.parts.map((p) => (
                  <PartRow
                    key={p.id}
                    part={p}
                    readOnly={!canEditDetails}
                    onSave={(unit_price_cents, qty) =>
                      updatePart(p.id, unit_price_cents, qty)
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
              <label className="text-sm font-medium text-muted-foreground">费率（USD/小时）</label>
              <Input
                type="number"
                step={0.01}
                placeholder="费率（USD/小时）"
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
                      {t.name}（{formatCents(t.last_rate_cents)}/小时）
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
          <div className="-mx-1 overflow-x-auto rounded-lg border border-border px-1 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[680px] table-fixed text-sm">
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[20%]" />
                {canEditDetails && <col className="w-[10%]" />}
              </colgroup>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">名称</th>
                  <th className="p-3 text-right font-medium">费率（USD/小时）</th>
                  <th className="p-3 text-right font-medium">小时</th>
                  <th className="p-3 text-right font-medium">小计</th>
                  {canEditDetails && <th className="p-3" aria-label="操作"></th>}
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
              <div className="flex items-center justify-between gap-3">
                <p className="shrink-0">
                  {caseState.apply_cleaning
                    ? `清洁费：${formatCents(caseState.cleaning_fee_cents)}`
                    : "清洁费：不收取"}
                </p>
                {canEditDetails ? (
                  <label className="flex items-center gap-2 text-sm select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={caseState.apply_cleaning}
                      disabled={loading}
                      onChange={(e) => toggleCleaning(e.target.checked)}
                    />
                    <span>收清洁费</span>
                  </label>
                ) : (
                  <span className="text-sm text-muted-foreground shrink-0">
                    {caseState.apply_cleaning ? "收清洁费" : "不收清洁费"}
                  </span>
                )}
              </div>
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
  onSave: (unit_price_cents: number, qty: number) => void;
  onDelete: () => void;
}) {
  const [price, setPrice] = useState((part.unit_price_cents / 100).toFixed(2));
  const [qty, setQty] = useState(String(part.qty));
  useEffect(() => {
    setPrice((part.unit_price_cents / 100).toFixed(2));
    setQty(String(part.qty));
  }, [part.unit_price_cents, part.qty]);
  const handleBlur = () => {
    const up = Math.max(0, Math.round((Number(price) || 0) * 100));
    const q = Math.max(1, parseInt(qty, 10) || 1);
    onSave(up, q);
  };
  if (readOnly) {
    return (
      <tr className="border-b">
        <td className="p-2 sm:p-3">{part.name}</td>
        <td className="p-2 sm:p-3 text-right">{formatCents(part.unit_price_cents)}</td>
        <td className="p-2 sm:p-3 text-right">{part.qty}</td>
        <td className="p-2 sm:p-3 text-right">{formatCents(part.line_total_cents)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="p-2 text-left font-medium sm:p-3">{part.name}</td>
      <td className="p-2 sm:p-3">
        <Input
          type="number"
          step={0.01}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={handleBlur}
          className="ml-auto min-h-[40px] w-20 text-right sm:min-h-[32px] sm:w-24"
        />
      </td>
      <td className="p-2 text-right sm:p-3">
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={handleBlur}
          className="ml-auto min-h-[40px] w-16 text-right sm:min-h-[32px] sm:w-20"
        />
      </td>
      <td className="p-2 sm:p-3 text-right align-middle">{formatCents(part.line_total_cents)}</td>
      <td className="p-2 text-right sm:p-3">
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
        <td className="p-2 sm:p-3 text-right">{formatCents(labor.rate_cents)}</td>
        <td className="p-2 sm:p-3 text-right">{labor.hours}</td>
        <td className="p-2 sm:p-3 text-right">{formatCents(labor.line_total_cents)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b hover:bg-muted/20">
      <td className="p-2 text-right sm:p-3">
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
          className="ml-auto min-h-[40px] w-20 text-right sm:min-h-[32px] sm:w-24"
        />
      </td>
      <td className="p-2 text-right sm:p-3">
        <Input
          type="number"
          step={0.25}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onBlur={handleBlur}
          className="ml-auto min-h-[40px] w-16 text-right sm:min-h-[32px] sm:w-20"
        />
      </td>
      <td className="p-2 sm:p-3 text-right align-middle">{formatCents(labor.line_total_cents)}</td>
      <td className="p-2 text-right sm:p-3">
        <Button variant="destructive" size="sm" onClick={onDelete} className="min-h-[40px] sm:min-h-[32px]">
          删除
        </Button>
      </td>
    </tr>
  );
}
