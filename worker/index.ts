import type { HealthResponse } from "../shared/types.ts";
import { loadCatalog } from "./catalog.ts";
import type { Env } from "./env.ts";
import { logger, newRequestId } from "./log.ts";
import { handleAdmin } from "./admin/http.ts";
import { handleOrder } from "./orders/http.ts";
import { withSecurityHeaders } from "./security/headers.ts";

function methodNotAllowed(requestId: string): Response {
  return Response.json({ error: "request_failed", request_id: requestId }, { status: 405 });
}

function hasBody(request: Request): boolean {
  const length = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(length) && length > 0;
}

async function route(request: Request, url: URL, requestId: string, env: Env): Promise<Response> {
  if (url.pathname === "/api/health") {
    if (request.method !== "GET" || hasBody(request)) return methodNotAllowed(requestId);
    const body: HealthResponse = {
      ok: true,
      service: "gaspampulha",
      turnstileSiteKey: env.TURNSTILE_SITEKEY ?? "",
    };
    return Response.json(body);
  }
  if (url.pathname === "/api/catalog") {
    if (request.method !== "GET" || hasBody(request)) return methodNotAllowed(requestId);
    const catalog = await loadCatalog(env.DB);
    return Response.json(catalog);
  }
  if (url.pathname === "/api/orders") return handleOrder(request, env, requestId);
  if (url.pathname.startsWith("/api/admin/")) return handleAdmin(request, env, requestId);
  return Response.json({ error: "request_failed", request_id: requestId }, { status: 404 });
}

export default {
  async fetch(request, env) {
    const requestId = newRequestId();
    const started = Date.now();
    const url = new URL(request.url);
    let response: Response;
    let detail: string | undefined;
    try {
      response = await route(request, url, requestId, env);
    } catch (error) {
      detail = error instanceof Error ? error.stack : undefined;
      response = Response.json(
        { error: "request_failed", request_id: requestId },
        { status: 500, headers: { "x-log-event": "INTERNAL_ERROR" } },
      );
    }
    const event = response.headers.get("x-log-event") ?? "request";
    const headers = new Headers(response.headers);
    headers.delete("x-log-event");
    const visible = new Response(response.body, { status: response.status, headers });
    const log = event.includes("REJECTED") || event === "INTERNAL_ERROR" ? logger.error : logger.info;
    log({
      request_id: requestId,
      event,
      method: request.method,
      route: url.pathname,
      status: visible.status,
      duration_ms: Date.now() - started,
      error_code: event === "INTERNAL_ERROR" ? "Error" : undefined,
      detail,
    });
    return withSecurityHeaders(visible, request);
  },
} satisfies ExportedHandler<Env>;
