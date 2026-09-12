import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { canAccessOwner, getAuthUserId } from "@/lib/auth";
import { CaseDetail } from "./case-detail";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: { orderBy: { created_at: "asc" } },
      labor: { orderBy: { created_at: "asc" } },
      status_logs: { orderBy: { changed_at: "desc" } },
    },
  });
  if (!c || !canAccessOwner(userId, c.clerk_user_id)) {
    redirect("/dashboard");
  }
  const laborSerialized = c.labor.map((l) => ({ ...l, hours: Number(l.hours) }));
  const statusLogsSerialized = c.status_logs.map((l) => ({
    ...l,
    changed_at: l.changed_at.toISOString(),
  }));
  return (
    <div className="page-shell pb-14 sm:pb-16">
      <div className="mb-6 flex flex-col gap-2">
        <Link href="/dashboard" className="text-primary hover:underline inline-flex items-center min-h-[44px]">
          ← 返回列表
        </Link>
        <div className="page-hero w-full">
          <p className="text-sm font-medium text-primary">维修单详情</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {c.plate ?? c.vin ?? `车号 ${c.unit_number ?? "-"}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">查看车辆资料、维修明细、费用和状态记录。</p>
        </div>
      </div>
      <CaseDetail
        caseData={{
          ...c,
          draft_data: c.draft_data ? JSON.parse(JSON.stringify(c.draft_data)) : null,
          draft_updated_at: c.draft_updated_at?.toISOString() ?? null,
          labor: laborSerialized,
          status_logs: statusLogsSerialized,
        }}
      />
    </div>
  );
}
