export const auditActions = [
  "ADMIN_LOGIN_SUCCESS",
  "ADMIN_LOGIN_FAILURE",
  "ADMIN_LOGOUT",
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "PAYMENT_STATUS_CHANGED",
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_DISABLED",
  "SETTINGS_UPDATED",
  "AUTH_RATE_LIMITED",
  "SECURITY_REJECTED_REQUEST",
  "INTERNAL_ERROR",
] as const;

export type AuditAction = (typeof auditActions)[number];

export interface AuditInput {
  action: AuditAction;
  outcome: "success" | "failure";
  actorType: "admin" | "anonymous" | "system" | "public";
  actorId?: number;
  resourceType?: string;
  resourceId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  metadata?: Record<string, string | number | boolean>;
}

export async function auditEvent(db: D1Database, input: AuditInput, now = new Date()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
        outcome, request_id, ip_hash, user_agent_hash, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      now.toISOString(),
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.outcome,
      input.requestId ?? null,
      input.ipHash ?? null,
      input.userAgentHash ?? null,
      JSON.stringify(input.metadata ?? {}),
    )
    .run();
}
