"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewCasePage() {
  const router = useRouter();
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [checkInAt, setCheckInAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const hasOne = (plate?.trim() !== "") || (vin?.trim() !== "") || (unitNumber.trim() !== "" && !Number.isNaN(Number(unitNumber)));
    if (!hasOne) {
      setError("请至少填写一项：车牌、VIN 或车号");
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
          unit_number: unitNumber.trim() ? Number(unitNumber) : undefined,
          customer_name: driverName.trim() || undefined,
          customer_phone: driverPhone.trim() || undefined,
          check_in_at: checkInAt ? new Date(checkInAt).toISOString() : new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? data.error ?? "创建失败");
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
    <div className="container mx-auto max-w-lg py-6 px-4 sm:py-8 sm:px-6">
      <div className="mb-4">
        <Link
          href="/dashboard"
          className="text-primary hover:underline inline-flex items-center gap-1 min-h-[44px] items-center"
        >
          ← 返回列表
        </Link>
      </div>
      <Card className="shadow-sm">
        <CardHeader className="pb-2 sm:p-6 sm:pb-2">
          <CardTitle className="text-lg sm:text-xl">新建维修单（登记）</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-6 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">以下三项至少填一项：车牌、车架号、车号</p>
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
                type="number"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="车号"
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
            <div className="grid gap-2">
              <Label>到店时间（可选，默认当前时间）</Label>
              <Input
                type="datetime-local"
                value={checkInAt}
                onChange={(e) => setCheckInAt(e.target.value)}
                className="min-h-[44px] sm:min-h-[40px]"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-6">
              {loading ? "创建中..." : "创建并进入详情"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
