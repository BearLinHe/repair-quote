import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CaseDetail } from "./case-detail";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: true,
      labor: true,
      status_logs: { orderBy: { changed_at: "desc" } },
    },
  });
  if (!c || c.clerk_user_id !== userId) {
    redirect("/dashboard");
  }
  const laborSerialized = c.labor.map((l) => ({ ...l, hours: Number(l.hours) }));
  const statusLogsSerialized = c.status_logs.map((l) => ({
    ...l,
    changed_at: l.changed_at.toISOString(),
  }));
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-4">
        <Link href="/dashboard" className="text-primary hover:underline">
          ← 返回列表
        </Link>
      </div>
      <CaseDetail
        caseData={{
          ...c,
          labor: laborSerialized,
          status_logs: statusLogsSerialized,
        }}
      />
    </div>
  );
}
