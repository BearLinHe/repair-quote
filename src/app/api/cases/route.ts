import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const querySchema = z.object({ query: z.string().optional() });

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ query: searchParams.get("query") ?? undefined });
  const query = parsed.success ? parsed.data.query : undefined;

  const where: {
    clerk_user_id: string;
    OR?: Array<
      | { plate: { contains: string; mode: "insensitive" } }
      | { vin: { contains: string; mode: "insensitive" } }
      | { unit_number: number }
    >;
  } = {
    clerk_user_id: userId,
  };
  if (query?.trim()) {
    const q = query.trim();
    const num = parseInt(q, 10);
    where.OR = [
      { plate: { contains: q, mode: "insensitive" } },
      { vin: { contains: q, mode: "insensitive" } },
      ...(Number.isNaN(num) ? [] : [{ unit_number: num }]),
    ];
  }

  const cases = await prisma.case.findMany({
    where,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      plate: true,
      vin: true,
      unit_number: true,
      status: true,
      grand_total_cents: true,
      created_at: true,
    },
  });

  return Response.json({ cases });
}

const createSchema = z
  .object({
    plate: z.string().optional(),
    vin: z.string().optional(),
    unit_number: z.number().int().optional(),
    customer_name: z.string().optional(),
    customer_phone: z.string().optional(),
    customer_email: z.string().optional(),
    check_in_at: z.string().datetime().optional(),
  })
  .refine((d) => (d.plate?.trim() ?? "") !== "" || (d.vin?.trim() ?? "") !== "" || (d.unit_number != null && !Number.isNaN(d.unit_number)), {
    message: "At least one of plate, vin, or unit_number must be provided",
  });

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  const body = await req.json();
  const parsed = createSchema.safeParse({
    ...body,
    unit_number: body.unit_number != null ? Number(body.unit_number) : undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.case.create({
      data: {
        clerk_user_id: userId,
        plate: data.plate?.trim() || null,
        vin: data.vin?.trim() || null,
        unit_number: data.unit_number ?? null,
        customer_name: data.customer_name?.trim() || null,
        customer_phone: data.customer_phone?.trim() || null,
        customer_email: data.customer_email?.trim() || null,
        check_in_at: data.check_in_at ? new Date(data.check_in_at) : new Date(),
        status: "SUBMITTED",
      },
    });
    await tx.caseStatusLog.create({
      data: {
        case_id: c.id,
        from_status: null,
        to_status: "SUBMITTED",
        changed_by: userId,
        note: "Case created",
      },
    });
    return c;
  });

  return Response.json(created);
}
