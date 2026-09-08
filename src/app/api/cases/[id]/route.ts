import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { recalcTotals } from "@/lib/recalc";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";
import { syncCompletedInvoice } from "@/lib/invoice-record";

const draftSchema = z.object({
  active_tab: z.enum(["items", "parts", "labor", "summary"]).optional(),
  repair_item_name: z.string().max(500).optional(),
  selected_inventory_id: z.string().max(100).optional(),
  part_price: z.string().max(50).optional(),
  part_qty: z.string().max(50).optional(),
  labor_name: z.string().max(500).optional(),
  labor_hours: z.string().max(50).optional(),
  labor_rate: z.string().max(50).optional(),
  status_note: z.string().max(1000).optional(),
});

const billToSchema = z.object({
  bill_to_company: z.string().trim().min(1, "Bill To 公司名称不能为空").max(200),
  bill_to_address: z.string().trim().max(500).nullable().optional(),
  bill_to_contact: z.string().trim().max(200).nullable().optional(),
  payment_method: z.string().trim().max(200).nullable().optional(),
});

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
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await getCaseAndCheck(id, userId);
  if (!c) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const { id } = await params;
  const c = await prisma.case.findUnique({
    where: { id },
    select: { clerk_user_id: true, status: true },
  });
  if (!c || c.clerk_user_id !== userId) return apiError("CASE_NOT_FOUND", "维修单不存在", 404);
  if (c.status === "CANCELED") {
    return apiError("CASE_READ_ONLY", "该维修单已结束，不能继续修改", 409);
  }
  const body = await req.json().catch(() => ({}));
  const data: {
    apply_tax?: boolean;
    apply_cleaning?: boolean;
    draft_data?: Prisma.InputJsonValue;
    draft_updated_at?: Date;
    bill_to_company?: string;
    bill_to_address?: string | null;
    bill_to_contact?: string | null;
    payment_method?: string | null;
  } = {};
  if ("apply_tax" in body) data.apply_tax = Boolean(body.apply_tax);
  if ("apply_cleaning" in body) data.apply_cleaning = Boolean(body.apply_cleaning);
  if ("draft_data" in body) {
    const parsedDraft = draftSchema.safeParse(body.draft_data);
    if (!parsedDraft.success) {
      return apiError("VALIDATION_ERROR", "草稿内容格式不正确", 400, parsedDraft.error.flatten());
    }
    data.draft_data = parsedDraft.data;
    data.draft_updated_at = new Date();
  }
  let updatedBillTo = false;
  if ("bill_to_company" in body || "bill_to_address" in body || "bill_to_contact" in body || "payment_method" in body) {
    const parsedBillTo = billToSchema.safeParse(body);
    if (!parsedBillTo.success) {
      return apiError("VALIDATION_ERROR", "Bill To 信息格式不正确", 400, parsedBillTo.error.flatten());
    }
    data.bill_to_company = parsedBillTo.data.bill_to_company;
    data.bill_to_address = parsedBillTo.data.bill_to_address || null;
    data.bill_to_contact = parsedBillTo.data.bill_to_contact || null;
    data.payment_method = parsedBillTo.data.payment_method || null;
    updatedBillTo = true;
  }
  if (Object.keys(data).length === 0) {
    return apiError("VALIDATION_ERROR", "没有可保存的内容", 400);
  }
  const shouldRecalculate = data.apply_tax !== undefined || data.apply_cleaning !== undefined;
  const actor = updatedBillTo ? await getAuditActor(userId) : null;
  await prisma.$transaction(async (tx) => {
    await tx.case.update({ where: { id }, data });
    if (shouldRecalculate) await recalcTotals(id, tx);
    if (c.status === "COMPLETED") await syncCompletedInvoice(id, tx);
    if (updatedBillTo && actor) {
      await tx.auditLog.create({
        data: auditData(actor, {
          action: "CASE_BILL_TO_UPDATED",
          entityType: "CASE",
          entityId: id,
          details: {
            bill_to_company: data.bill_to_company,
            bill_to_address: data.bill_to_address,
            bill_to_contact: data.bill_to_contact,
            payment_method: data.payment_method,
          },
        }),
      });
    }
  });
  const updated = await prisma.case.findUnique({ where: { id } });
  return Response.json(updated);
}
