import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

export async function GET() {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const invoices = await prisma.invoiceRecord.findMany({
    where: { clerk_user_id: userId },
    include: { case: { select: { plate: true, vin: true, unit_number: true, customer_name: true } } },
    orderBy: { issued_at: "desc" },
    take: 300,
  });
  return Response.json({ invoices });
}

const paymentSchema = z.object({
  id: z.string().uuid(),
  payment_status: z.enum(["UNPAID", "PARTIAL", "PAID", "VOID"]),
});

export async function PATCH(req: NextRequest) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  const parsed = paymentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "付款状态格式不正确", 400);
  const invoice = await prisma.invoiceRecord.findFirst({ where: { id: parsed.data.id, clerk_user_id: userId } });
  if (!invoice) return apiError("INVOICE_NOT_FOUND", "Invoice 不存在", 404);
  const actor = await getAuditActor(userId);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.invoiceRecord.update({ where: { id: invoice.id }, data: { payment_status: parsed.data.payment_status } });
    await tx.auditLog.create({ data: auditData(actor, { action: "INVOICE_PAYMENT_UPDATED", entityType: "INVOICE", entityId: invoice.id, entityLabel: invoice.invoice_number, details: { from_status: invoice.payment_status, to_status: parsed.data.payment_status } }) });
    return result;
  });
  return Response.json(updated);
}
