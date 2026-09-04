CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_user_id" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "actor_email" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "entity_label" TEXT,
  "details" JSONB,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");
CREATE INDEX "AuditLog_actor_user_id_created_at_idx" ON "AuditLog"("actor_user_id", "created_at");
CREATE INDEX "AuditLog_entity_type_entity_id_created_at_idx" ON "AuditLog"("entity_type", "entity_id", "created_at");
