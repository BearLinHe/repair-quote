"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button type="button" disabled={loading} onClick={async () => { setLoading(true); await fetch("/api/auth/logout", { method: "POST" }).catch(() => null); window.location.assign("/sign-in"); }} className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="退出登录" title="退出登录">
      <LogOut className="size-4" />
    </button>
  );
}
