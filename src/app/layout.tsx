import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { AppNavigation, MobileNavigation } from "@/components/app-navigation";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentAccount } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "维修报价 | YaoYuan Inc.",
  description: "维修登记/报价系统",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const account = await getCurrentAccount();
  return (
      <html lang="zh-CN">
        <body className="min-h-screen bg-background font-sans antialiased">
          <header className="sticky top-0 z-30 border-b border-border/80 bg-card/90 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80">
            <div className="mx-auto flex min-h-16 w-full max-w-[2048px] items-center gap-4 px-4 sm:min-h-[76px] sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
              <Link href="/dashboard" className="group flex min-w-0 items-center gap-3" aria-label="YaoYuan 维修管理首页">
                <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-primary/35 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--primary)_88%,white),color-mix(in_srgb,var(--primary)_72%,black))] text-white shadow-[0_10px_26px_color-mix(in_srgb,var(--primary)_24%,transparent)] transition-transform group-hover:-rotate-2 group-hover:scale-[1.03] sm:size-11 sm:rounded-2xl">
                  <span className="absolute -right-3 -top-3 size-8 rounded-full border border-white/25" />
                  <span className="absolute -bottom-3 -left-2 size-7 rounded-full bg-black/10" />
                  <Wrench className="relative size-5 stroke-[2.2]" />
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-base font-extrabold leading-tight tracking-tight">YaoYuan</span>
                  <span className="mt-0.5 hidden text-[10px] font-semibold uppercase leading-tight tracking-[0.16em] text-muted-foreground sm:block">Service Operations</span>
                </span>
              </Link>
              <div className="ml-auto flex items-center gap-3">
                {account ? <>
                  <AppNavigation />
                  <span className="mx-1 hidden h-7 w-px bg-border lg:block" />
                  <div className="hidden text-right xl:block"><p className="max-w-36 truncate text-xs font-semibold">{account.name}</p><p className="text-[10px] text-muted-foreground">{account.role === "ADMIN" ? "全局只读" : "业务账号"}</p></div>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{account.name.trim().charAt(0).toUpperCase()}</span>
                  <LogoutButton />
                </> : <Link href="/sign-in" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">登录</Link>}
              </div>
            </div>
          </header>
          <main className="min-h-[calc(100vh-64px)] pb-24 sm:min-h-[calc(100vh-76px)] lg:pb-0">
            {account?.role === "ADMIN" && <div className="border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">管理员全局视图：正在查看全部账号数据，当前为只读模式</div>}
            {children}
          </main>
          {account && <MobileNavigation />}
        </body>
      </html>
  );
}
