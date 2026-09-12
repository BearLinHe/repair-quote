import { z } from "zod";
import { prisma } from "@/lib/db";
import { adminReadOnlyResponse, isAdminScope, requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

const updateSettingsSchema = z.object({
  company_name: z.string().trim().min(1).max(120),
  cleaning_rate_bps: z.number().int().min(0).max(10_000),
  cleaning_cap_cents: z.number().int().min(0).max(100_000_000),
  tax_rate_bps: z.number().int().min(0).max(10_000),
});

export async function GET() {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const [settings, currentUser, auditLogs] = await Promise.all([
    prisma.setting.findUnique({ where: { id: "default" } }),
    getAuditActor(userId),
    prisma.auditLog.findMany({ where: isAdminScope(userId) ? {} : { actor_user_id: userId }, orderBy: { created_at: "desc" }, take: 100 }),
  ]);
  if (!settings) {
    return apiError("SETTINGS_NOT_FOUND", "系统配置尚未初始化", 404);
  }
  return Response.json({ ...settings, current_user: currentUser, audit_logs: auditLogs });
}

export async function PATCH(req: Request) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();
  if (isAdminScope(userId)) return adminReadOnlyResponse();

  const body = await req.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "系统配置格式不正确", 400, parsed.error.flatten());
  }

  const actor = await getAuditActor(userId);
  const settings = await prisma.$transaction(async (tx) => {
    const updated = await tx.setting.upsert({
      where: { id: "default" },
      create: { id: "default", ...parsed.data },
      update: parsed.data,
    });
    await tx.auditLog.create({ data: auditData(actor, { action: "SETTINGS_UPDATED", entityType: "SETTING", entityId: "default", entityLabel: "系统配置", details: { changed_fields: Object.keys(parsed.data) } }) });
    return updated;
  });
  return Response.json(settings);
}
