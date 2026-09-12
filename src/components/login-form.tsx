"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api-error";

export function LoginForm() {
  const params = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiErrorMessage(data, "登录失败"));
      const requested = params.get("redirect_url");
      window.location.assign(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
      setLoading(false);
    }
  };

  return (
    <div className="page-shell flex min-h-[calc(100vh-76px)] items-center justify-center py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-7"><p className="section-eyebrow">YaoYuan Service Operations</p><h1 className="mt-2 text-3xl font-bold">账号登录</h1></div>
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="login">账号</Label><div className="relative"><UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="login" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} className="pl-10" placeholder="邮箱或 admin" required autoFocus /></div></div>
          <div className="space-y-2"><Label htmlFor="password">密码</Label><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-10" required /></div></div>
          {error && <p className="rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="min-h-12 w-full" disabled={loading}>{loading ? "正在登录…" : "登录"}</Button>
        </form>
      </div>
    </div>
  );
}
