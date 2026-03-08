import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";

async function checkCase(id: string, userId: string) {
  const c = await prisma.case.findUnique({ where: { id }, select: { id: true, clerk_user_id: true } });
  return c && c.clerk_user_id === userId;
}

const createSchema = z.object({
  name: z.string().min(1),
  unit_price_cents: z.number().int().min(0),
  qty: z.number().int().min(1),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
  qty: z.number().int().min(1).optional(),
});

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
    unit_price_cents: body.unit_price_cents != null ? Number(body.unit_price_cents) : undefined,
    qty: body.qty != null ? Number(body.qty) : undefined,
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const { name, unit_price_cents, qty } = parsed.data;
  const line_total_cents = unit_price_cents * qty;
  const part = await prisma.casePart.create({
    data: { case_id: id, name: name.trim(), unit_price_cents, qty, line_total_cents },
  });
  await recalcTotals(id);
  return Response.json(part);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const partId = body.id as string | undefined;
  if (!partId) return Response.json({ error: "id required" }, { status: 400 });
  const parsed = updateSchema.safeParse({
    ...body,
    unit_price_cents: body.unit_price_cents != null ? Number(body.unit_price_cents) : undefined,
    qty: body.qty != null ? Number(body.qty) : undefined,
  });
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const existing = await prisma.casePart.findFirst({
    where: { id: partId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Part not found" }, { status: 404 });
  const name = parsed.data.name !== undefined ? parsed.data.name.trim() : existing.name;
  const unit_price_cents = parsed.data.unit_price_cents ?? existing.unit_price_cents;
  const qty = parsed.data.qty ?? existing.qty;
  const line_total_cents = unit_price_cents * qty;
  const part = await prisma.casePart.update({
    where: { id: partId },
    data: { name, unit_price_cents, qty, line_total_cents },
  });
  await recalcTotals(id);
  return Response.json(part);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  if (!(await checkCase(id, userId))) return Response.json({ error: "Not found" }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const partId = searchParams.get("id");
  if (!partId) return Response.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.casePart.findFirst({
    where: { id: partId, case_id: id },
  });
  if (!existing) return Response.json({ error: "Part not found" }, { status: 404 });
  await prisma.casePart.delete({ where: { id: partId } });
  await recalcTotals(id);
  return Response.json({ ok: true });
}
