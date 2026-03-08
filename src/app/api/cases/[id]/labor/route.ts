import { NextRequest } from "next/server";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, clerk_user_id: true } });
  return c && c.clerk_user_id === userId;
}

const createSchema = z.object({
  name: z.string().min(1),
  hours: z.number().min(0),
  rate_cents: z.number().int().min(0),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  hours: z.number().min(0).optional(),
  rate_cents: z.number().int().min(0).optional(),
});

function laborLineTotal(hours: number, rate_cents: number): number {
  return Math.round(hours * rate_cents);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const parsed = createSchema.safeParse({
    ...body,
    hours: body.hours != null ? Number(body.hours) : undefined,
    rate_cents: body.rate_cents != null ? Number(body.rate_cents) : undefined,
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { name, hours, rate_cents } = parsed.data;
  const line_total_cents = laborLineTotal(hours, rate_cents);
  const labor = await prisma.caseLabor.create({
    data: {
      case_id: id,
      name: name.trim(),
      hours: new Decimal(hours),
      rate_cents,
      line_total_cents,
    },
  });
  await recalcTotals(id);
  return Response.json({
    ...labor,
    hours: Number(labor.hours),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const laborId = body.id as string | undefined;
  if (!laborId) return Response.json({ error: "id required" }, { status: 400 });
  const parsed = updateSchema.safeParse({
    ...body,
    hours: body.hours != null ? Number(body.hours) : undefined,
    rate_cents: body.rate_cents != null ? Number(body.rate_cents) : undefined,
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.caseLabor.findFirst({
    where: { id: laborId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Labor not found" }, { status: 404 });
  const name = parsed.data.name !== undefined ? parsed.data.name.trim() : existing.name;
  const hours = parsed.data.hours !== undefined ? parsed.data.hours : Number(existing.hours);
  const rate_cents = parsed.data.rate_cents ?? existing.rate_cents;
  const line_total_cents = laborLineTotal(hours, rate_cents);
  const labor = await prisma.caseLabor.update({
    where: { id: laborId },
    data: {
      name,
      hours: new Decimal(hours),
      rate_cents,
      line_total_cents,
    },
  });
  await recalcTotals(id);
  return Response.json({
    ...labor,
    hours: Number(labor.hours),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const laborId = searchParams.get("id");
  if (!laborId) return Response.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.caseLabor.findFirst({
    where: { id: laborId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Labor not found" }, { status: 404 });
  await prisma.caseLabor.delete({ where: { id: laborId } });
  await recalcTotals(id);
  return Response.json({ ok: true });
}
