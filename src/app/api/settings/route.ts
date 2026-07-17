import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const updateSettingsSchema = z.object({
  company_name: z.string().trim().min(1).max(120),
  cleaning_rate_bps: z.number().int().min(0).max(10_000),
  cleaning_cap_cents: z.number().int().min(0).max(100_000_000),
  tax_rate_bps: z.number().int().min(0).max(10_000),
});

export async function GET() {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const settings = await prisma.setting.findUnique({ where: { id: "default" } });
  if (!settings) {
    return apiError("SETTINGS_NOT_FOUND", "系统配置尚未初始化", 404);
  }
  return Response.json(settings);
}

export async function PATCH(req: Request) {
  const userId = await requireAuth();
  if (!userId) return unauthorizedResponse();

  const body = await req.json().catch(() => null);
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "系统配置格式不正确", 400, parsed.error.flatten());
  }

  const settings = await prisma.setting.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });
  return Response.json(settings);
}
