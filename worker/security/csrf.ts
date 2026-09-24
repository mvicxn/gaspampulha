import { hashSecret } from "./session.ts";

export const CSRF_HEADER = "x-csrf-token";

export function newCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function csrfTokenHash(token: string, pepper: string): Promise<string> {
  return hashSecret(token, `csrf:${pepper}`);
}

export async function storeCsrfToken(
  db: D1Database,
  sessionTokenHash: string,
  token: string,
  pepper: string,
  expiresAt: string,
): Promise<void> {
  const tokenHash = await csrfTokenHash(token, pepper);
  await db
    .prepare(
      "INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)",
    )
    .bind(tokenHash, sessionTokenHash, expiresAt)
    .run();
}

export async function consumeCsrfToken(
  db: D1Database,
  sessionTokenHash: string,
  token: string,
  pepper: string,
  nowIso: string,
): Promise<boolean> {
  const tokenHash = await csrfTokenHash(token, pepper);
  const row = await db
    .prepare(
      "DELETE FROM csrf_tokens WHERE token_hash = ? AND session_token_hash = ? AND expires_at > ? RETURNING token_hash",
    )
    .bind(tokenHash, sessionTokenHash, nowIso)
    .first<{ token_hash: string }>();
  return row !== null;
}
