import type { Metadata, Viewport } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { Wrench } from "lucide-react";
import { AppNavigation, MobileNavigation } from "@/components/app-navigation";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider localization={{ locale: "zh-CN" }}>
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
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">登录</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">注册</button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <AppNavigation />
                  <span className="mx-1 hidden h-7 w-px bg-border lg:block" />
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </div>
            </div>
          </header>
          <main className="min-h-[calc(100vh-64px)] pb-24 sm:min-h-[calc(100vh-76px)] lg:pb-0">{children}</main>
          <SignedIn><MobileNavigation /></SignedIn>
        </body>
      </html>
    </ClerkProvider>
  );
}
