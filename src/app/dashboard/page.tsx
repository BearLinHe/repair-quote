import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { CaseList } from "./case-list";

export default async function DashboardPage() {
  await auth();
  return (
    <div className="container mx-auto py-6 px-4 sm:py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-xl font-bold sm:text-2xl">维修单列表</h1>
        <Link
          href="/cases/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-primary-foreground font-medium hover:bg-primary/90 transition-colors min-h-[44px] sm:min-h-[40px]"
        >
          新建维修单
        </Link>
      </div>
      <CaseList />
    </div>
  );
}
