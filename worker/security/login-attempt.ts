import { authPolicy, originSubject, userSubject, type AuthGate } from "./auth-guard.ts";

const BUMP = `INSERT INTO auth_attempts (subject_hash, window_started_at, attempt_count, blocked_until)
VALUES (?1, ?2, 1, NULL)
ON CONFLICT(subject_hash) DO UPDATE SET
  window_started_at = CASE
    WHEN auth_attempts.window_started_at < ?3 THEN ?2
    ELSE auth_attempts.window_started_at
  END,
  attempt_count = CASE
    WHEN auth_attempts.window_started_at < ?3 THEN 1
    WHEN auth_attempts.blocked_until IS NOT NULL AND auth_attempts.blocked_until > ?2 THEN auth_attempts.attempt_count
    ELSE auth_attempts.attempt_count + 1
  END,
  blocked_until = CASE
    WHEN auth_attempts.window_started_at < ?3 THEN NULL
    WHEN auth_attempts.blocked_until IS NOT NULL AND auth_attempts.blocked_until > ?2 THEN auth_attempts.blocked_until
    WHEN ?4 = 'origin' AND auth_attempts.attempt_count + 1 >= 6 THEN ?5
    WHEN ?4 = 'origin' AND auth_attempts.attempt_count + 1 = 5 THEN ?6
    WHEN ?4 = 'origin' AND auth_attempts.attempt_count + 1 = 4 THEN ?7
    WHEN ?4 = 'origin' AND auth_attempts.attempt_count + 1 = 3 THEN ?8
    WHEN ?4 = 'user' AND auth_attempts.attempt_count + 1 >= 5 THEN ?9
    ELSE NULL
  END
RETURNING subject_hash, window_started_at, attempt_count, blocked_until`;

interface AttemptRow {
  subject_hash: string;
  window_started_at: string;
  attempt_count: number;
  blocked_until: string | null;
}

export async function bumpAttempt(
  db: D1Database,
  subjectHash: string,
  scope: "origin" | "user",
  now: Date,
): Promise<AttemptRow> {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - authPolicy.windowMs).toISOString();
  const row = await db
    .prepare(BUMP)
    .bind(
      subjectHash,
      nowIso,
      cutoff,
      scope,
      new Date(now.getTime() + authPolicy.originBlockMs).toISOString(),
      new Date(now.getTime() + authPolicy.backoffMs[5]).toISOString(),
      new Date(now.getTime() + authPolicy.backoffMs[4]).toISOString(),
      new Date(now.getTime() + authPolicy.backoffMs[3]).toISOString(),
      new Date(now.getTime() + authPolicy.userBackoffMs).toISOString(),
    )
    .first<AttemptRow>();
  if (!row) throw new Error("auth_bump_failed");
  return row;
}

export function gateFromRows(origin: AttemptRow, user: AttemptRow, now: Date): AuthGate {
  const nowMs = now.getTime();
  const originWait = origin.blocked_until ? Math.max(0, Date.parse(origin.blocked_until) - nowMs) : 0;
  const userWait =
    user.attempt_count >= authPolicy.userBackoffAt && user.blocked_until
      ? Math.max(0, Date.parse(user.blocked_until) - nowMs)
      : 0;
  const blocked = origin.attempt_count >= authPolicy.originBlockAt && originWait > 0;
  const retryAfterMs = Math.max(originWait, userWait);
  const allowed = retryAfterMs === 0;
  return {
    allowed,
    turnstileRequired: origin.attempt_count >= 3 || user.attempt_count >= authPolicy.userTurnstileAt,
    retryAfterMs,
    blocked,
    event: allowed ? null : "AUTH_RATE_LIMITED",
    audit: !allowed,
  };
}

export async function recordLoginFailure(db: D1Database, userHash: string, originHash: string, now: Date): Promise<AuthGate> {
  const origin = await bumpAttempt(db, originSubject(userHash, originHash), "origin", now);
  if (origin.blocked_until && Date.parse(origin.blocked_until) > now.getTime() && origin.attempt_count >= 3) {
    const user = await db
      .prepare("SELECT subject_hash, window_started_at, attempt_count, blocked_until FROM auth_attempts WHERE subject_hash = ?")
      .bind(userSubject(userHash))
      .first<AttemptRow>();
    return gateFromRows(
      origin,
      user ?? { subject_hash: userSubject(userHash), window_started_at: now.toISOString(), attempt_count: 0, blocked_until: null },
      now,
    );
  }
  const user = await bumpAttempt(db, userSubject(userHash), "user", now);
  return gateFromRows(origin, user, now);
}

export async function clearLoginFailures(db: D1Database, userHash: string, originHash: string): Promise<void> {
  await db
    .prepare("DELETE FROM auth_attempts WHERE subject_hash IN (?, ?)")
    .bind(userSubject(userHash), originSubject(userHash, originHash))
    .run();
}
