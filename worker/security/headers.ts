export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
} as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function withSecurityHeaders(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  const url = new URL(request.url);
  const productionHttps = url.protocol === "https:" && !LOCAL_HOSTS.has(url.hostname);
  if (productionHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  } else {
    headers.delete("Strict-Transport-Security");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

export function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const url = new URL(value, "https://app.local");
    return url.origin === "https://app.local";
  } catch {
    return false;
  }
}
