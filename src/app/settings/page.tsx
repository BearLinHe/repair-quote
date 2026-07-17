"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "配置加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (field: keyof SettingsForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

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
    <div className="container mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
        ← 返回维修单列表
      </Link>
      <Card className="mt-4 shadow-sm">
        <CardHeader>
          <CardTitle>系统配置</CardTitle>
          <p className="text-sm text-muted-foreground">
            配置将在维修单下次重新计算时生效，不会主动改写已完成的历史报价。
          </p>
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
  );
}
