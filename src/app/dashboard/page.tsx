import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { CaseList } from "./case-list";

export default async function DashboardPage() {
  await auth();
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">维修单列表</h1>
        <Link
          href="/cases/new"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        >
          新建维修单
        </Link>
      </div>
      <CaseList />
    </div>
  );
}
