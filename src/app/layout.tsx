import type { Metadata } from "next";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "维修报价 | YaoYuan Inc.",
  description: "维修登记/报价系统",
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
          <header className="border-b border-border bg-card flex items-center justify-end gap-2 px-4 py-2">
            <SignedOut>
              <SignInButton mode="modal" />
              <SignUpButton mode="modal" />
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
