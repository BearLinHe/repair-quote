import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import type { CaseStatus } from "@prisma/client";
import { canTransitionCase } from "@/lib/case-rules";
import { apiError } from "@/lib/api-error";

const bodySchema = z.object({
  to_status: z.enum(["SUBMITTED", "IN_PROGRESS", "CANCELED", "COMPLETED"]),
  note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { id: true, clerk_user_id: true, status: true },
  });
  if (!c || c.clerk_user_id !== userId) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError("VALIDATION_ERROR", "状态信息格式不正确", 400, parsed.error.flatten());
  const to_status = parsed.data.to_status as CaseStatus;
  if (!canTransitionCase(c.status, to_status)) {
    return apiError("INVALID_STATUS_TRANSITION", "当前状态不允许执行此操作", 409);
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
