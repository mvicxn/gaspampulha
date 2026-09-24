const NAMES = ["TURNSTILE_SECRET", "AUDIT_HASH_SALT"] as const;

export type SecretName = (typeof NAMES)[number];

export function requireSecret(env: object, name: SecretName): string {
  const value = (env as Record<string, unknown>)[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("missing_secret");
  }
  return value;
}
