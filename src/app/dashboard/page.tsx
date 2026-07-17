import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CaseList } from "./case-list";

export default async function DashboardPage() {
  await auth();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-sm font-medium text-primary">维修工作台</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">维修单</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground sm:text-base">查询车辆、跟进维修进度，并快速生成客户报价。</p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md sm:w-auto"
        >
          <Plus className="size-4" />
          新建维修单
        </Link>
      </div>
      <CaseList />
    </div>
  );
}
