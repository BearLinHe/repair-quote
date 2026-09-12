import type { Prisma } from "@prisma/client";
import { getCurrentAccount } from "@/lib/auth";

export type AuditActor = {
  userId: string;
  name: string;
  email: string | null;
};

export async function getAuditActor(userId: string): Promise<AuditActor> {
  const account = await getCurrentAccount();
  if (!account) return { userId, name: userId, email: null };
  return { userId, name: account.name, email: account.email };
}

export function auditData(
  actor: AuditActor,
  input: { action: string; entityType: string; entityId?: string; entityLabel?: string; details?: Prisma.InputJsonObject },
) {
  return {
    actor_user_id: actor.userId,
    actor_name: actor.name,
    actor_email: actor.email,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_label: input.entityLabel ?? null,
    ...(input.details ? { details: input.details } : {}),
  };
}
