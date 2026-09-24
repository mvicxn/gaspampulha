import { readJson } from "../validate.ts";
import { priceOrder, placeOrder, type StockProduct } from "./create.ts";
import { parseOrder } from "./input.ts";
import { requireSecret } from "../security/secrets.ts";
import { verifyTurnstile } from "./turnstile.ts";

export interface OrderEnv {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
}

function fail(status: number, requestId: string, event: string): Response {
  return Response.json(
    { error: "request_failed", request_id: requestId },
    { status, headers: { "x-log-event": event } },
  );
}

export async function handleOrder(
  request: Request,
  env: OrderEnv,
  requestId: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return fail(405, requestId, "ORDER_CREATE_VALIDATION_REJECTED");
  const turnstileSecret = requireSecret(env, "TURNSTILE_SECRET");
  const body = await readJson(request);
  if (!body.ok) return fail(400, requestId, "ORDER_CREATE_VALIDATION_REJECTED");
  const parsed = parseOrder(body.value);
  if (!parsed.ok) return fail(400, requestId, "ORDER_CREATE_VALIDATION_REJECTED");
  const hostname = new URL(request.url).hostname;
  const turnstileOk = await verifyTurnstile({
    token: parsed.value.turnstileToken,
    secret: turnstileSecret,
    hostname,
    action: "order",
    fetcher,
  });
  if (!turnstileOk) return fail(403, requestId, "ORDER_CREATE_TURNSTILE_REJECTED");
  const ids = parsed.value.items.map((item) => item.productId);
  const placeholders = ids.map(() => "?").join(",");
  const loaded = await env.DB.prepare(
    `SELECT id, name, price_cents, active FROM products WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<StockProduct>();
  const priced = priceOrder(parsed.value, loaded.results);
  if (!priced.ok) return fail(400, requestId, "ORDER_CREATE_VALIDATION_REJECTED");
  const placed = await placeOrder(env.DB, parsed.value, loaded.results, requestId);
  if (!placed.ok) return fail(placed.status, requestId, "ORDER_CREATE_VALIDATION_REJECTED");
  return Response.json(placed.order, {
    status: placed.replay ? 200 : 201,
    headers: { "x-log-event": placed.replay ? "ORDER_CREATE_IDEMPOTENT_REPLAY" : "ORDER_CREATE_SUCCESS" },
  });
}
