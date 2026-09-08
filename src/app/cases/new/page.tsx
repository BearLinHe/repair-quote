"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api-error";
import { DateTimePicker } from "@/components/ui/date-picker";

export default function NewCasePage() {
  const router = useRouter();
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [billToCompany, setBillToCompany] = useState("");
  const [billToAddress, setBillToAddress] = useState("");
  const [billToContact, setBillToContact] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const hasOne = plate.trim() !== "" || vin.trim() !== "" || unitNumber.trim() !== "";
    if (!hasOne) {
      setError("请至少填写一项：车牌、VIN 或车号");
      return;
    }
    if (!billToCompany.trim()) {
      setError("请填写 Bill To 公司名称");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.trim() || undefined,
          vin: vin.trim() || undefined,
          unit_number: unitNumber.trim() || undefined,
          customer_name: driverName.trim() || undefined,
          customer_phone: driverPhone.trim() || undefined,
          bill_to_company: billToCompany.trim(),
          bill_to_address: billToAddress.trim() || undefined,
          bill_to_contact: billToContact.trim() || undefined,
          payment_method: paymentMethod.trim() || undefined,
          check_in_at: checkInAt ? new Date(checkInAt).toISOString() : new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data, "创建失败"));
        return;
      }
      router.push(`/cases/${data.id}`);
    } catch (err) {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell space-y-6">
      <div className="page-hero">
        <Link
          href="/dashboard"
          className="text-primary hover:underline inline-flex items-center gap-1 min-h-[44px] items-center"
        >
          ← 返回列表
        </Link>
        <p className="section-eyebrow mt-4">维修工作台</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">新建维修单</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">先登记车辆和联系人，创建后再添加维修项目、库存配件与人工。</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,.5fr)]">
      <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
        <CardHeader className="border-b bg-muted/30 p-5 sm:p-7">
          <CardTitle className="text-xl sm:text-2xl">车辆与司机资料</CardTitle>
          <p className="text-sm text-muted-foreground">登记车辆与司机信息，创建后即可开始添加维修明细。</p>
        </CardHeader>
        <CardContent className="p-5 sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">车牌、车架号或车号至少填写一项。</div>
            <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>车牌</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="车牌号" className="min-h-[44px] sm:min-h-[40px]" />
            </div>
            <div className="grid gap-2">
              <Label>车架号（VIN）</Label>
              <Input value={vin} onChange={(e) => setVin(e.target.value)} placeholder="车架号" className="min-h-[44px] sm:min-h-[40px]" />
            </div>
            <div className="grid gap-2">
              <Label>车号</Label>
              <Input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="例如：A-102、TRUCK-7"
                className="min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            <div className="grid gap-2">
              <Label>司机姓名（可选）</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="司机姓名" className="min-h-[44px] sm:min-h-[40px]" />
            </div>
            <div className="grid gap-2">
              <Label>司机电话（可选）</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="司机电话" className="min-h-[44px] sm:min-h-[40px]" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>到店时间（可选，默认当前时间）</Label>
              <DateTimePicker value={checkInAt} onChange={setCheckInAt} />
            </div>
            </div>
            <div className="border-t pt-6">
              <h2 className="text-base font-semibold">Bill To</h2>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bill-to-company">公司名称 *</Label>
                  <Input
                    id="bill-to-company"
                    value={billToCompany}
                    onChange={(e) => setBillToCompany(e.target.value)}
                    placeholder="客户公司名称"
                    required
                    className="min-h-[44px] sm:min-h-[40px]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bill-to-contact">负责人（可选）</Label>
                  <Input
                    id="bill-to-contact"
                    value={billToContact}
                    onChange={(e) => setBillToContact(e.target.value)}
                    placeholder="负责人姓名"
                    className="min-h-[44px] sm:min-h-[40px]"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="bill-to-address">地址（可选）</Label>
                  <Input
                    id="bill-to-address"
                    value={billToAddress}
                    onChange={(e) => setBillToAddress(e.target.value)}
                    placeholder="账单地址"
                    className="min-h-[44px] sm:min-h-[40px]"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="payment-method">付款方式（可选）</Label>
                  <Input
                    id="payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    placeholder="例如：现金、支票、Zelle 或银行转账"
                    className="min-h-[44px] sm:min-h-[40px]"
                  />
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end border-t pt-5">
            <Button type="submit" disabled={loading} className="min-h-11 w-full rounded-xl px-6 sm:w-auto">
              {loading ? "创建中..." : "创建并进入详情"}
            </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader><CardTitle>创建流程</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <p><span className="mr-2 font-semibold text-primary">01</span>登记车辆与司机信息。</p>
          <p><span className="mr-2 font-semibold text-primary">02</span>添加维修项目、配件与人工。</p>
          <p><span className="mr-2 font-semibold text-primary">03</span>完成维修后生成 Invoice 并扣减库存。</p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
