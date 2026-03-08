import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, clerk_user_id: true } });
  return c && c.clerk_user_id === userId;
}

const createSchema = z.object({ name: z.string().min(1), sort_order: z.number().int().optional() });
const updateSchema = z.object({ name: z.string().min(1).optional(), sort_order: z.number().int().optional() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const maxOrder = await prisma.caseRepairItem.findFirst({
    where: { case_id: id },
    orderBy: { sort_order: "desc" },
    select: { sort_order: true },
  });
  const item = await prisma.caseRepairItem.create({
    data: {
      case_id: id,
      name: parsed.data.name.trim(),
      sort_order: parsed.data.sort_order ?? (maxOrder?.sort_order ?? -1) + 1,
    },
  });
  await recalcTotals(id);
  return Response.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const itemId = body.id as string | undefined;
  if (!itemId) return Response.json({ error: "id required" }, { status: 400 });
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.caseRepairItem.findFirst({
    where: { id: itemId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Item not found" }, { status: 404 });
  const item = await prisma.caseRepairItem.update({
    where: { id: itemId },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name.trim() }),
      ...(parsed.data.sort_order !== undefined && { sort_order: parsed.data.sort_order }),
    },
  });
  return Response.json(item);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("id");
  if (!itemId) return Response.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.caseRepairItem.findFirst({
    where: { id: itemId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Item not found" }, { status: 404 });
  await prisma.caseRepairItem.delete({ where: { id: itemId } });
  await recalcTotals(id);
  return Response.json({ ok: true });
}
