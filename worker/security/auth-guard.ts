export interface AuthWindow {
  subjectHash: string;
  windowStartedAt: string;
  attemptCount: number;
  blockedUntil: string | null;
}

export interface AuthAttemptStore {
  get(subjectHash: string): Promise<AuthWindow | null>;
  save(window: AuthWindow): Promise<void>;
  clear(subjectHash: string): Promise<void>;
}

export interface AuthSubjects {
  userHash: string;
  originHash: string;
}

export const authPolicy = {
  windowMs: 15 * 60 * 1000,
  backoffMs: { 3: 30_000, 4: 120_000, 5: 300_000 },
  originBlockAt: 6,
  originBlockMs: 15 * 60 * 1000,
  userTurnstileAt: 5,
  userBackoffAt: 5,
  userBackoffMs: 120_000,
} as const;

export interface AuthGate {
  allowed: boolean;
  turnstileRequired: boolean;
  retryAfterMs: number;
  blocked: boolean;
  event: "AUTH_RATE_LIMITED" | null;
  audit: boolean;
}

export function userSubject(userHash: string): string {
  return `user:${userHash}`;
}

export function originSubject(userHash: string, originHash: string): string {
  return `uo:${userHash}:${originHash}`;
}

function blank(subjectHash: string, now: Date): AuthWindow {
  return {
    subjectHash,
    windowStartedAt: now.toISOString(),
    attemptCount: 0,
    blockedUntil: null,
  };
}

function live(window: AuthWindow | null, subjectHash: string, now: Date): AuthWindow {
  if (!window || now.getTime() - Date.parse(window.windowStartedAt) >= authPolicy.windowMs) {
    return blank(subjectHash, now);
  }
  if (window.blockedUntil && Date.parse(window.blockedUntil) <= now.getTime()) {
    return { ...window, blockedUntil: null };
  }
  return window;
}

function remaining(window: AuthWindow, nowMs: number): number {
  if (!window.blockedUntil) return 0;
  return Math.max(0, Date.parse(window.blockedUntil) - nowMs);
}

function originDelay(count: number): { delayMs: number; blocked: boolean } {
  if (count >= authPolicy.originBlockAt) {
    return { delayMs: authPolicy.originBlockMs, blocked: true };
  }
  if (count >= 5) return { delayMs: authPolicy.backoffMs[5], blocked: false };
  if (count >= 4) return { delayMs: authPolicy.backoffMs[4], blocked: false };
  if (count >= 3) return { delayMs: authPolicy.backoffMs[3], blocked: false };
  return { delayMs: 0, blocked: false };
}

export async function registerFailure(
  store: AuthAttemptStore,
  subjects: AuthSubjects,
  now: Date,
): Promise<AuthGate> {
  const userKey = userSubject(subjects.userHash);
  const originKey = originSubject(subjects.userHash, subjects.originHash);
  const nowMs = now.getTime();
  const origin = live(await store.get(originKey), originKey, now);
  const user = live(await store.get(userKey), userKey, now);
  const originWait = remaining(origin, nowMs);

  if (originWait > 0) {
    return {
      allowed: false,
      turnstileRequired: true,
      retryAfterMs: originWait,
      blocked: origin.attemptCount >= authPolicy.originBlockAt,
      event: "AUTH_RATE_LIMITED",
      audit: false,
    };
  }

  const nextOrigin: AuthWindow = { ...origin, attemptCount: origin.attemptCount + 1 };
  const nextUser: AuthWindow = { ...user, attemptCount: user.attemptCount + 1 };
  const originRule = originDelay(nextOrigin.attemptCount);
  if (originRule.delayMs > 0) {
    nextOrigin.blockedUntil = new Date(nowMs + originRule.delayMs).toISOString();
  }
  const userWait = nextUser.attemptCount >= authPolicy.userBackoffAt ? authPolicy.userBackoffMs : 0;
  if (userWait > 0) {
    nextUser.blockedUntil = new Date(nowMs + userWait).toISOString();
  }

  await store.save(nextOrigin);
  await store.save(nextUser);

  const turnstileRequired =
    nextOrigin.attemptCount >= 3 || nextUser.attemptCount >= authPolicy.userTurnstileAt;
  const retryAfterMs = Math.max(originRule.delayMs, userWait);
  const allowed = retryAfterMs === 0;
  return {
    allowed,
    turnstileRequired,
    retryAfterMs,
    blocked: originRule.blocked,
    event: allowed ? null : "AUTH_RATE_LIMITED",
    audit: !allowed,
  };
}

export async function clearAuthFailures(
  store: AuthAttemptStore,
  subjects: AuthSubjects,
): Promise<void> {
  await store.clear(userSubject(subjects.userHash));
  await store.clear(originSubject(subjects.userHash, subjects.originHash));
}

export function d1AuthAttemptStore(db: D1Database): AuthAttemptStore {
  return {
    async get(subjectHash) {
      const row = await db
        .prepare(
          "SELECT subject_hash, window_started_at, attempt_count, blocked_until FROM auth_attempts WHERE subject_hash = ?",
        )
        .bind(subjectHash)
        .first<{
          subject_hash: string;
          window_started_at: string;
          attempt_count: number;
          blocked_until: string | null;
        }>();
      if (!row) return null;
      return {
        subjectHash: row.subject_hash,
        windowStartedAt: row.window_started_at,
        attemptCount: row.attempt_count,
        blockedUntil: row.blocked_until,
      };
    },
    async save(window) {
      await db
        .prepare(
          `INSERT INTO auth_attempts (subject_hash, window_started_at, attempt_count, blocked_until)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(subject_hash) DO UPDATE SET
             window_started_at = excluded.window_started_at,
             attempt_count = excluded.attempt_count,
             blocked_until = excluded.blocked_until`,
        )
        .bind(window.subjectHash, window.windowStartedAt, window.attemptCount, window.blockedUntil)
        .run();
    },
    async clear(subjectHash) {
      await db.prepare("DELETE FROM auth_attempts WHERE subject_hash = ?").bind(subjectHash).run();
    },
  };
}
