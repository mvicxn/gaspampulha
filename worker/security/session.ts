export const SESSION_COOKIE = "__Host-admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export async function hashSecret(value: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pepper}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function revokeSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function revokeAllSessions(db: D1Database, adminId: number): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE admin_id = ?").bind(adminId).run();
}
