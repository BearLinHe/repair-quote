import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

async function getCaseAndCheck(id: string, userId: string) {
  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      repair_items: { orderBy: { sort_order: "asc" } },
      parts: { orderBy: { created_at: "asc" } },
      labor: { orderBy: { created_at: "asc" } },
      status_logs: { orderBy: { changed_at: "desc" } },
    },
  });
  if (!c || c.clerk_user_id !== userId) return null;
  return c;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  const c = await getCaseAndCheck(id, userId);
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const labor = c.labor.map((l) => ({
    id: l.id,
    case_id: l.case_id,
    name: l.name,
    hours: Number(l.hours),
    rate_cents: l.rate_cents,
    line_total_cents: l.line_total_cents,
    created_at: l.created_at,
    updated_at: l.updated_at,
  }));
  return Response.json({
    ...c,
    labor,
  });
}
