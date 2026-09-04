import { currentUser } from "@clerk/nextjs/server";
import type { Prisma } from "@prisma/client";

export type AuditActor = {
  userId: string;
  name: string;
  email: string | null;
};

export async function getAuditActor(userId: string): Promise<AuditActor> {
  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? null;
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return {
      userId,
      name: fullName || user?.username || email || userId,
      email,
    };
  } catch {
    return { userId, name: userId, email: null };
  }
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
