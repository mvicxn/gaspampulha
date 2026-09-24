export interface Env {
  DB: D1Database;
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_SECRET?: string;
  AUDIT_HASH_SALT?: string;
}
