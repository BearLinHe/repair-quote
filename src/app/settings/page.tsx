"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error";

type SettingsForm = {
  companyName: string;
  cleaningRate: string;
  cleaningCap: string;
  taxRate: string;
};

type CurrentUserInfo = { userId: string; name: string; email: string | null };
type AuditLog = {
  id: string;
  created_at: string;
  actor_user_id: string;
  actor_name: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_label: string | null;
};

const emptyForm: SettingsForm = {
  companyName: "",
  cleaningRate: "",
  cleaningCap: "",
  taxRate: "",
};

export default function SettingsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [currentUserInfo, setCurrentUserInfo] = useState<CurrentUserInfo | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(apiErrorMessage(data, response.status === 401 ? "登录已失效" : "配置加载失败"));
        return data;
      })
      .then((data) => {
        setForm({
          companyName: data.company_name,
          cleaningRate: (data.cleaning_rate_bps / 100).toFixed(2),
          cleaningCap: (data.cleaning_cap_cents / 100).toFixed(2),
          taxRate: (data.tax_rate_bps / 100).toFixed(2),
        });
        setCurrentUserInfo(data.current_user ?? null);
        setAuditLogs(data.audit_logs ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "配置加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (field: keyof SettingsForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const actionLabel = (action: string) => ({
    PURCHASE_CREATED: "创建采购单",
    PURCHASE_RECEIVED: "确认采购入库",
    PURCHASE_CANCELED: "取消采购单",
    INVENTORY_OTHER_INBOUND: "其他入库",
    INVENTORY_COUNTED: "库存盘点",
    INVENTORY_UPDATED: "修改库存资料",
    INVENTORY_ITEM_CREATED: "创建库存商品",
    CASE_CREATED: "创建维修单",
    CASE_STATUS_CHANGED: "变更维修单状态",
    CASE_REPAIR_ITEM_ADDED: "添加维修项目",
    CASE_REPAIR_ITEM_UPDATED: "修改维修项目",
    CASE_REPAIR_ITEM_DELETED: "删除维修项目",
    CASE_PART_ADDED: "添加维修配件",
    CASE_PART_UPDATED: "修改维修配件",
    CASE_PART_DELETED: "删除维修配件",
    CASE_LABOR_ADDED: "添加人工费用",
    CASE_LABOR_UPDATED: "修改人工费用",
    CASE_LABOR_DELETED: "删除人工费用",
    SETTINGS_UPDATED: "修改系统配置",
    INVOICE_PAYMENT_UPDATED: "修改 Invoice 付款状态",
  })[action] ?? action;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: form.companyName.trim(),
          cleaning_rate_bps: Math.round(Number(form.cleaningRate) * 100),
          cleaning_cap_cents: Math.round(Number(form.cleaningCap) * 100),
          tax_rate_bps: Math.round(Number(form.taxRate) * 100),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data, response.status === 401 ? "登录已失效" : "配置保存失败"));
      setMessage("系统配置已保存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "配置保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell space-y-6">
      <div className="page-hero">
        <Link href="/dashboard" className="inline-flex min-h-10 items-center text-sm font-medium text-primary hover:underline">← 返回维修单列表</Link>
        <p className="section-eyebrow mt-4">系统管理</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">系统配置</h1>
      </div>
      {currentUserInfo && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UserRound className="size-6" /></span>
              <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">当前登录账号</p><h2 className="mt-1 truncate text-lg font-bold">{currentUserInfo.name}</h2><p className="truncate text-sm text-muted-foreground">{currentUserInfo.email ?? "未设置邮箱"}</p></div>
            </div>
            <div className="rounded-xl bg-muted/60 px-4 py-3"><p className="text-xs text-muted-foreground">账号 ID</p><p className="mt-1 max-w-[320px] truncate font-mono text-xs">{currentUserInfo.userId}</p></div>
          </CardContent>
        </Card>
      )}
      <div>
      <Card>
        <CardHeader>
          <CardTitle>费用与公司资料</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-sm text-muted-foreground">正在加载配置...</p>
          ) : (
            <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="company-name">公司名称</Label>
                <Input id="company-name" value={form.companyName} onChange={(e) => updateField("companyName", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cleaning-rate">清洁费率（%）</Label>
                <Input id="cleaning-rate" type="number" min="0" max="100" step="0.01" value={form.cleaningRate} onChange={(e) => updateField("cleaningRate", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cleaning-cap">清洁费上限（USD）</Label>
                <Input id="cleaning-cap" type="number" min="0" step="0.01" value={form.cleaningCap} onChange={(e) => updateField("cleaningCap", e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tax-rate">税率（%）</Label>
                <Input id="tax-rate" type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(e) => updateField("taxRate", e.target.value)} required />
              </div>
              <div className="flex items-end sm:justify-end">
                <Button type="submit" disabled={saving} className="min-h-11 w-full sm:w-auto">
                  {saving ? "保存中..." : "保存配置"}
                </Button>
              </div>
              {(error || message) && (
                <p className={`text-sm sm:col-span-2 ${error ? "text-destructive" : "text-emerald-700"}`}>
                  {error || message}
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b"><div className="flex items-center gap-3"><History className="size-5 text-primary" /><CardTitle>操作记录</CardTitle></div><span className="text-xs text-muted-foreground">最近 {auditLogs.length} 条</span></CardHeader>
        <CardContent className="p-0">
          {auditLogs.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">暂无操作记录</div> : (
            <><div className="divide-y divide-border/70 sm:hidden">{auditLogs.map((log) => <div key={log.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{actionLabel(log.action)}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{log.entity_label ?? "—"}</p></div><time className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(log.created_at).toLocaleDateString("zh-CN")}</time></div><div className="mt-3 flex items-center justify-between border-t pt-3 text-sm"><div><p className="font-medium">{log.actor_name}</p><p className="text-xs text-muted-foreground">{log.actor_email ?? "—"}</p></div><span className="max-w-32 truncate font-mono text-[10px] text-muted-foreground">{log.actor_user_id}</span></div></div>)}</div><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[860px] text-sm"><thead className="border-b bg-muted/35 text-left text-xs font-semibold text-muted-foreground"><tr><th className="px-5 py-3">时间</th><th className="px-4 py-3">操作账号</th><th className="px-4 py-3">业务动作</th><th className="px-4 py-3">关联记录</th><th className="px-5 py-3">账号 ID</th></tr></thead><tbody className="divide-y divide-border/60">{auditLogs.map((log) => <tr key={log.id} className="hover:bg-muted/20"><td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted-foreground">{new Date(log.created_at).toLocaleString("zh-CN", { hour12: false })}</td><td className="px-4 py-3"><p className="font-semibold">{log.actor_name}</p><p className="text-xs text-muted-foreground">{log.actor_email ?? "—"}</p></td><td className="px-4 py-3 font-medium">{actionLabel(log.action)}</td><td className="px-4 py-3">{log.entity_label ?? "—"}</td><td className="max-w-[220px] truncate px-5 py-3 font-mono text-xs text-muted-foreground">{log.actor_user_id}</td></tr>)}</tbody></table></div></>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
