import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CaseList } from "./case-list";

export default async function DashboardPage() {
  await auth();
  return (
    <div className="page-shell">
      <div className="page-hero mb-6 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-eyebrow">Repair workspace</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">维修单</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-base">查询车辆、跟进维修进度，并快速生成客户报价。</p>
        </div>
        <Link
          href="/cases/new"
          className="relative z-10 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl sm:w-auto"
        >
          <Plus className="size-4" />
          新建维修单
        </Link>
      </div>
      <CaseList />
    </div>
  );
}
