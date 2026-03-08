import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { CaseStatus } from "@prisma/client";

const transitions: Record<CaseStatus, CaseStatus[]> = {
  SUBMITTED: ["IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["COMPLETED", "CANCELED"],
  CANCELED: [],
  COMPLETED: [],
};

const bodySchema = z.object({
  to_status: z.enum(["SUBMITTED", "IN_PROGRESS", "CANCELED", "COMPLETED"]),
  note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { id: true, clerk_user_id: true, status: true },
  });
  if (!c || c.clerk_user_id !== userId) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  const to_status = parsed.data.to_status as CaseStatus;
  const allowed = transitions[c.status];
  if (!allowed.includes(to_status)) {
    return Response.json(
      { error: `Transition from ${c.status} to ${to_status} not allowed` },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.case.update({
      where: { id },
      data: { status: to_status },
    }),
    prisma.caseStatusLog.create({
      data: {
        case_id: id,
        from_status: c.status,
        to_status,
        changed_by: userId,
        note: parsed.data.note ?? undefined,
      },
    }),
  ]);

  const updated = await prisma.case.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  return Response.json(updated);
}
