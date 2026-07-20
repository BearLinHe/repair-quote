import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { generateInvoiceNumber } from "@/lib/invoice-number";

const querySchema = z.object({ query: z.string().optional() });

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({ query: searchParams.get("query") ?? undefined });
  const query = parsed.success ? parsed.data.query : undefined;

  const where: {
    clerk_user_id: string;
    OR?: Array<
      | { plate: { contains: string; mode: "insensitive" } }
      | { vin: { contains: string; mode: "insensitive" } }
      | { unit_number: { contains: string; mode: "insensitive" } }
      | { invoice_number: { contains: string; mode: "insensitive" } }
    >;
  } = {
    clerk_user_id: userId,
  };
  if (query?.trim()) {
    const q = query.trim();
    where.OR = [
      { plate: { contains: q, mode: "insensitive" } },
      { vin: { contains: q, mode: "insensitive" } },
      { unit_number: { contains: q, mode: "insensitive" } },
      { invoice_number: { contains: q, mode: "insensitive" } },
    ];
  }

  const cases = await prisma.case.findMany({
    where,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      invoice_number: true,
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
    unit_number: z.string().trim().optional(),
    customer_name: z.string().optional(),
    customer_phone: z.string().optional(),
    customer_email: z.string().optional(),
    check_in_at: z.string().datetime().optional(),
  })
  .refine((d) => (d.plate?.trim() ?? "") !== "" || (d.vin?.trim() ?? "") !== "" || (d.unit_number?.trim() ?? "") !== "", {
    message: "At least one of plate, vin, or unit_number must be provided",
  });

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "维修单信息格式不正确", 400, parsed.error.flatten());
  }
  const data = parsed.data;

  const created = await prisma.$transaction(async (tx) => {
    let invoiceNumber = generateInvoiceNumber();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const existing = await tx.case.findUnique({
        where: { invoice_number: invoiceNumber },
        select: { id: true },
      });
      if (!existing) break;
      invoiceNumber = generateInvoiceNumber();
    }

    const c = await tx.case.create({
      data: {
        invoice_number: invoiceNumber,
        clerk_user_id: userId,
        plate: data.plate?.trim() || null,
        vin: data.vin?.trim() || null,
        unit_number: data.unit_number?.trim() || null,
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
