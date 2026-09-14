import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentAccount, unauthorizedResponse } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { auditData, getAuditActor } from "@/lib/audit";

const permissionSchema = z.object({
  is_active: z.boolean(),
  can_write: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await getCurrentAccount();
  if (!account) return unauthorizedResponse();
  if (account.role !== "ADMIN") return apiError("ADMIN_REQUIRED", "只有最高管理员可以修改账号权限", 403);

  const { id } = await params;
  const parsed = permissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "账号权限格式不正确", 400, parsed.error.flatten());

  const target = await prisma.appUser.findUnique({ where: { id } });
  if (!target) return apiError("ACCOUNT_NOT_FOUND", "账号不存在", 404);
  if (target.role === "ADMIN") return apiError("ADMIN_PROTECTED", "最高管理员权限不能在此处修改", 409);

  const actor = await getAuditActor("__ADMIN__");
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.appUser.update({
      where: { id },
      data: parsed.data,
      select: { id: true, login: true, email: true, name: true, role: true, is_active: true, can_write: true, data_owner_id: true, created_at: true },
    });
    if (!parsed.data.is_active) await tx.appSession.deleteMany({ where: { app_user_id: id } });
    await tx.auditLog.create({
      data: auditData(actor, {
        action: "ACCOUNT_PERMISSIONS_UPDATED",
        entityType: "APP_USER",
        entityId: id,
        entityLabel: target.login,
        details: { is_active: parsed.data.is_active, can_write: parsed.data.can_write },
      }),
    });
    return user;
  });
  return Response.json({ account: updated });
}
