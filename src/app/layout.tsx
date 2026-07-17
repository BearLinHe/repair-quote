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
import { ClipboardList, Settings, Wrench } from "lucide-react";
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
            <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="维修报价首页">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <Wrench className="size-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold leading-tight sm:text-base">维修报价</span>
                  <span className="hidden text-[11px] leading-tight text-muted-foreground sm:block">YaoYuan Inc.</span>
                </span>
              </Link>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">登录</button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">注册</button>
                  </SignUpButton>
                </SignedOut>
                <SignedIn>
                  <nav className="flex items-center gap-1" aria-label="主要导航">
                    <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3">
                      <ClipboardList className="size-4" />
                      <span className="hidden sm:inline">维修单</span>
                    </Link>
                    <Link href="/settings" className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3">
                      <Settings className="size-4" />
                      <span className="hidden sm:inline">设置</span>
                    </Link>
                  </nav>
                  <span className="mx-1 h-6 w-px bg-border" />
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </div>
            </div>
          </header>
          <main className="min-h-[calc(100vh-64px)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
