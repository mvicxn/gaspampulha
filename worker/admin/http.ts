import type { OrderStatus, PaymentStatus } from "../../shared/types.ts";
import { readJson } from "../validate.ts";
import { canChangeOrderStatus, canChangePaymentStatus } from "../order-status.ts";
import { newCsrfToken, consumeCsrfToken, CSRF_HEADER } from "../security/csrf.ts";
import { clearLoginFailures, recordLoginFailure } from "../security/login-attempt.ts";
import { hashPassword, verifyPassword } from "../security/password.ts";
import { assertSameOrigin } from "../security/headers.ts";
import {
  clearSessionCookie,
  hashSecret,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookie,
} from "../security/session.ts";
import { buildDeliveryText, buildWaLink } from "./delivery.ts";
import { routeCatalogAdmin } from "./manage.ts";
import { verifyTurnstile } from "../orders/turnstile.ts";
import { requireSecret } from "../security/secrets.ts";

interface AdminEnv {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  AUDIT_HASH_SALT?: string;
}

interface SessionRow {
  tokenHash: string;
  adminId: number;
  expiresAt: string;
}

const ORDER_STATUSES = ["novo", "confirmado", "preparando", "saiu", "entregue", "cancelado"] as const;
const PAYMENT_STATUSES = ["pendente", "pago"] as const;

function pepper(env: AdminEnv): string {
  return requireSecret(env, "AUDIT_HASH_SALT");
}

function fail(status: number, requestId: string, event: string): Response {
  return Response.json(
    { error: "request_failed", request_id: requestId },
    { status, headers: { "x-log-event": event } },
  );
}

function cookie(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  const parts = header.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!found) return null;
  const value = found.slice(SESSION_COOKIE.length + 1);
  if (!/^[0-9a-f]{64}$/.test(value)) return null;
  return value;
}

let dummyHash: Promise<string> | null = null;

async function requireSession(request: Request, env: AdminEnv, now: Date): Promise<SessionRow | null> {
  const token = cookie(request);
  if (!token) return null;
  const tokenHash = await hashSecret(token, pepper(env));
  const row = await env.DB.prepare(
    "SELECT token_hash, admin_id, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first<{ token_hash: string; admin_id: number; expires_at: string }>();
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
  return { tokenHash: row.token_hash, adminId: row.admin_id, expiresAt: row.expires_at };
}

function parseLogin(value: unknown): { username: string; password: string; turnstileToken: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["username", "password", "turnstileToken"].includes(key))) return null;
  if (typeof body.username !== "string" || typeof body.password !== "string" || typeof body.turnstileToken !== "string") {
    return null;
  }
  const username = body.username.trim();
  if (!/^[a-z0-9_]{3,32}$/.test(username) || body.password.length < 10 || body.password.length > 72) return null;
  if (body.turnstileToken.length < 1 || body.turnstileToken.length > 2048) return null;
  return { username, password: body.password, turnstileToken: body.turnstileToken };
}

async function login(request: Request, env: AdminEnv, requestId: string, now: Date): Promise<Response> {
  const body = await readJson(request);
  const parsed = body.ok ? parseLogin(body.value) : null;
  if (!parsed) return fail(400, requestId, "ADMIN_LOGIN_FAILURE");
  const originHash = await hashSecret(request.headers.get("cf-connecting-ip") ?? "local", pepper(env));
  const userHash = await hashSecret(parsed.username, pepper(env));
  const existing = await env.DB.prepare(
    "SELECT blocked_until, attempt_count FROM auth_attempts WHERE subject_hash = ?",
  )
    .bind(`uo:${userHash}:${originHash}`)
    .first<{ blocked_until: string | null; attempt_count: number }>();
  if (existing?.blocked_until && Date.parse(existing.blocked_until) > now.getTime()) {
    return fail(429, requestId, "AUTH_RATE_LIMITED");
  }
  const turnstileOk = await verifyTurnstile({
    token: parsed.turnstileToken,
    secret: requireSecret(env, "TURNSTILE_SECRET"),
    hostname: new URL(request.url).hostname,
    action: "admin-login",
  });
  if (!turnstileOk) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  const admin = await env.DB.prepare("SELECT id, password_hash FROM admin_users WHERE username = ?")
    .bind(parsed.username)
    .first<{ id: number; password_hash: string }>();
  dummyHash ??= hashPassword("invalid-password-placeholder");
  const valid = await verifyPassword(parsed.password, admin?.password_hash ?? (await dummyHash));
  if (!admin || !valid) {
    const gate = await recordLoginFailure(env.DB, userHash, originHash, now);
    await env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id,
        outcome, request_id, metadata_json
      ) VALUES (?, ?, 'anonymous', NULL, 'ADMIN_LOGIN_FAILURE', 'admin', NULL, 'failure', ?, '{}')`,
    )
      .bind(crypto.randomUUID(), now.toISOString(), requestId)
      .run();
    return fail(gate.allowed ? 401 : 429, requestId, gate.allowed ? "ADMIN_LOGIN_FAILURE" : "AUTH_RATE_LIMITED");
  }
  await clearLoginFailures(env.DB, userHash, originHash);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...tokenBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashSecret(token, pepper(env));
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const csrf = newCsrfToken();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    ).bind(tokenHash, admin.id, expires, now.toISOString()),
    env.DB.prepare(
      "INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)",
    ).bind(await hashSecret(csrf, `csrf:${pepper(env)}`), tokenHash, expires),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, outcome, request_id, metadata_json
      ) VALUES (?, ?, 'admin', ?, 'ADMIN_LOGIN_SUCCESS', 'admin', 'success', ?, '{}')`,
    ).bind(crypto.randomUUID(), now.toISOString(), admin.id, requestId),
  ]);
  return Response.json(
    { ok: true, csrfToken: csrf },
    { status: 200, headers: { "set-cookie": sessionCookie(token), "x-log-event": "ADMIN_LOGIN_SUCCESS" } },
  );
}

async function logout(request: Request, env: AdminEnv, requestId: string, session: SessionRow, now: Date): Promise<Response> {
  if (!assertSameOrigin(request)) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  const csrf = request.headers.get(CSRF_HEADER) ?? "";
  const used = await consumeCsrfToken(env.DB, session.tokenHash, csrf, pepper(env), now.toISOString());
  if (!used) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash),
    env.DB.prepare("DELETE FROM csrf_tokens WHERE session_token_hash = ?").bind(session.tokenHash),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, outcome, request_id, metadata_json
      ) VALUES (?, ?, 'admin', ?, 'ADMIN_LOGOUT', 'admin', 'success', ?, '{}')`,
    ).bind(crypto.randomUUID(), now.toISOString(), session.adminId, requestId),
  ]);
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": clearSessionCookie(), "x-log-event": "ADMIN_LOGOUT" } },
  );
}

async function listOrders(url: URL, env: AdminEnv, requestId: string): Promise<Response> {
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  const status = url.searchParams.get("status");
  const payment = url.searchParams.get("paymentStatus");
  if (status && !ORDER_STATUSES.includes(status as OrderStatus)) return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  if (payment && !PAYMENT_STATUSES.includes(payment as PaymentStatus)) return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  const query = url.searchParams.get("q");
  let like: string | null = null;
  if (query !== null && query !== "") {
    const trimmed = query.trim();
    if (trimmed.length > 40 || /[\u0000-\u001F]/.test(trimmed)) {
      return fail(400, requestId, "ORDER_LIST_FAILURE");
    }
    like = `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  }
  const cursor = url.searchParams.get("cursor");
  let cursorTime = "9999-12-31T23:59:59.999Z";
  let cursorId = Number.MAX_SAFE_INTEGER;
  if (cursor) {
    const decoded = atob(cursor);
    const [time, idText] = decoded.split("|");
    if (!time || !idText || Number.isNaN(Date.parse(time)) || !/^\d+$/.test(idText)) {
      return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
    }
    cursorTime = time;
    cursorId = Number(idText);
  }
  const rows = await env.DB.prepare(
    `SELECT id, public_code, customer_name, phone, street, number, neighborhood, complement, reference, city,
            notes, status, payment_method, payment_status, total_cents, created_at, updated_at
     FROM orders
     WHERE (? IS NULL OR status = ?)
       AND (? IS NULL OR payment_status = ?)
       AND (created_at < ? OR (created_at = ? AND id < ?))
       AND (
         ? IS NULL
         OR public_code LIKE ? ESCAPE '\\'
         OR customer_name LIKE ? ESCAPE '\\'
         OR phone LIKE ? ESCAPE '\\'
       )
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(status, status, payment, payment, cursorTime, cursorTime, cursorId, like, like, like, like, limit + 1)
    .all<Record<string, string | number>>();
  const page = rows.results.slice(0, limit);
  const ids = page.map((row) => row.id);
  const items = ids.length
    ? await env.DB.prepare(
        `SELECT order_id, product_name, unit_price_cents, qty FROM order_items WHERE order_id IN (${ids.map(() => "?").join(",")})`,
      )
        .bind(...ids)
        .all<{ order_id: number; product_name: string; unit_price_cents: number; qty: number }>()
    : { results: [] };
  const orders = page.map((row) => ({
    id: row.id,
    publicCode: row.public_code,
    customerName: row.customer_name,
    phone: row.phone,
    address: {
      street: row.street,
      number: row.number,
      neighborhood: row.neighborhood,
      complement: row.complement,
      reference: row.reference,
      city: row.city,
    },
    notes: row.notes,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: items.results
      .filter((item) => item.order_id === row.id)
      .map((item) => ({ productName: item.product_name, unitPriceCents: item.unit_price_cents, qty: item.qty })),
  }));
  const last = page.at(-1);
  const nextCursor =
    rows.results.length > limit && last
      ? btoa(`${String(last.created_at)}|${String(last.id)}`)
      : null;
  return Response.json(
    { orders, nextCursor },
    { headers: { "x-log-event": like ? "ORDER_SEARCH" : "ORDER_LIST_SUCCESS" } },
  );
}

async function patchOrder(
  request: Request,
  env: AdminEnv,
  requestId: string,
  session: SessionRow,
  orderId: number,
  now: Date,
): Promise<Response> {
  if (!assertSameOrigin(request)) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  const body = await readJson(request);
  if (!body.ok || typeof body.value !== "object" || body.value === null || Array.isArray(body.value)) {
    return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  }
  const fields = body.value as Record<string, unknown>;
  const keys = Object.keys(fields);
  const status = fields.status;
  const paymentStatus = fields.paymentStatus;
  const changingStatus = keys.length === 1 && keys[0] === "status" && typeof status === "string";
  const changingPayment = keys.length === 1 && keys[0] === "paymentStatus" && typeof paymentStatus === "string";
  if (!changingStatus && !changingPayment) return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  const csrf = request.headers.get(CSRF_HEADER) ?? "";
  const used = await consumeCsrfToken(env.DB, session.tokenHash, csrf, pepper(env), now.toISOString());
  if (!used) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  const current = await env.DB.prepare(
    "SELECT id, public_code, status, payment_status FROM orders WHERE id = ?",
  )
    .bind(orderId)
    .first<{ id: number; public_code: string; status: OrderStatus; payment_status: PaymentStatus }>();
  if (!current) return fail(404, requestId, "SECURITY_REJECTED_REQUEST");
  const stamp = now.toISOString();
  const csrfNext = newCsrfToken();
  const csrfHash = await hashSecret(csrfNext, `csrf:${pepper(env)}`);
  if (changingStatus) {
    if (!ORDER_STATUSES.includes(status as OrderStatus) || !canChangeOrderStatus(current.status, status as OrderStatus)) {
      return fail(409, requestId, "SECURITY_REJECTED_REQUEST");
    }
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?").bind(
        status,
        stamp,
        orderId,
        current.status,
      ),
      env.DB.prepare(
        `INSERT INTO audit_events (
          event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
        )
        SELECT ?, ?, 'admin', ?, 'ORDER_STATUS_CHANGED', 'order', public_code, 'success', ?, ?
        FROM orders WHERE id = ? AND status = ? AND updated_at = ?`,
      ).bind(
        crypto.randomUUID(),
        stamp,
        session.adminId,
        requestId,
        JSON.stringify({ from: current.status, to: status }),
        orderId,
        status,
        stamp,
      ),
      env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
        csrfHash,
        session.tokenHash,
        session.expiresAt,
      ),
    ]);
    const changes = result[0]?.meta?.changes ?? 0;
    if (changes !== 1) return fail(409, requestId, "SECURITY_REJECTED_REQUEST");
    return Response.json({ ok: true, csrfToken: csrfNext }, { headers: { "x-log-event": "ORDER_STATUS_UPDATE_SUCCESS" } });
  }
  if (!PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus) || !canChangePaymentStatus(current.payment_status, paymentStatus as PaymentStatus)) {
    return fail(409, requestId, "SECURITY_REJECTED_REQUEST");
  }
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ? AND payment_status = ?").bind(
      paymentStatus,
      stamp,
      orderId,
      current.payment_status,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
      )
      SELECT ?, ?, 'admin', ?, 'PAYMENT_STATUS_CHANGED', 'order', public_code, 'success', ?, ?
      FROM orders WHERE id = ? AND payment_status = ? AND updated_at = ?`,
    ).bind(
      crypto.randomUUID(),
      stamp,
      session.adminId,
      requestId,
      JSON.stringify({ from: current.payment_status, to: paymentStatus }),
      orderId,
      paymentStatus,
      stamp,
    ),
    env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
      csrfHash,
      session.tokenHash,
      session.expiresAt,
    ),
  ]);
  if ((result[0]?.meta?.changes ?? 0) !== 1) return fail(409, requestId, "SECURITY_REJECTED_REQUEST");
  return Response.json(
    { ok: true, csrfToken: csrfNext },
    { headers: { "x-log-event": "PAYMENT_STATUS_UPDATE_SUCCESS" } },
  );
}

async function orderDetail(env: AdminEnv, requestId: string, orderId: number): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, public_code, customer_name, phone, street, number, neighborhood, complement, reference, city,
            notes, status, payment_method, payment_status, total_cents, created_at, updated_at
     FROM orders WHERE id = ?`,
  )
    .bind(orderId)
    .first<Record<string, string | number>>();
  if (!row) return fail(404, requestId, "ORDER_LIST_FAILURE");
  const items = await env.DB.prepare(
    "SELECT product_name, unit_price_cents, qty FROM order_items WHERE order_id = ?",
  )
    .bind(orderId)
    .all<{ product_name: string; unit_price_cents: number; qty: number }>();
  return Response.json(
    {
      order: {
        id: row.id,
        publicCode: row.public_code,
        customerName: row.customer_name,
        phone: row.phone,
        address: {
          street: row.street,
          number: row.number,
          neighborhood: row.neighborhood,
          complement: row.complement,
          reference: row.reference,
          city: row.city,
        },
        notes: row.notes,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        totalCents: row.total_cents,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        items: items.results.map((item) => ({
          productName: item.product_name,
          unitPriceCents: item.unit_price_cents,
          qty: item.qty,
        })),
      },
    },
    { headers: { "x-log-event": "ORDER_DETAIL_SUCCESS" } },
  );
}

async function deliveryLink(
  request: Request,
  env: AdminEnv,
  requestId: string,
  session: SessionRow,
  orderId: number,
  now: Date,
): Promise<Response> {
  if (!assertSameOrigin(request)) return fail(403, requestId, "DELIVERY_LINK_REJECTED");
  const csrf = request.headers.get(CSRF_HEADER) ?? "";
  const used = await consumeCsrfToken(env.DB, session.tokenHash, csrf, pepper(env), now.toISOString());
  if (!used) return fail(403, requestId, "DELIVERY_LINK_REJECTED");
  const setting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'delivery_whatsapp_number'",
  ).first<{ value: string }>();
  const order = await env.DB.prepare(
    `SELECT public_code, customer_name, phone, street, number, neighborhood, city, reference, notes, payment_method, total_cents
     FROM orders WHERE id = ?`,
  )
    .bind(orderId)
    .first<Record<string, string | number>>();
  if (!order) return fail(404, requestId, "DELIVERY_LINK_REJECTED");
  const items = await env.DB.prepare("SELECT product_name, qty FROM order_items WHERE order_id = ?")
    .bind(orderId)
    .all<{ product_name: string; qty: number }>();
  const cents = Number(order.total_cents);
  const text = buildDeliveryText({
    publicCode: String(order.public_code),
    customerName: String(order.customer_name),
    phone: String(order.phone),
    address: {
      street: String(order.street),
      number: String(order.number),
      neighborhood: String(order.neighborhood),
      city: String(order.city),
      reference: String(order.reference),
    },
    notes: String(order.notes),
    paymentMethod: String(order.payment_method),
    totalLabel: `R$ ${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`,
    lines: items.results.map((item) => ({ qty: item.qty, name: item.product_name })),
  });
  const url = buildWaLink(setting?.value ?? "", text);
  if (!url) return fail(400, requestId, "DELIVERY_LINK_REJECTED");
  const token = newCsrfToken();
  const hash = await hashSecret(token, `csrf:${pepper(env)}`);
  await env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
    hash,
    session.tokenHash,
    session.expiresAt,
  ).run();
  return Response.json({ url, csrfToken: token }, { headers: { "x-log-event": "DELIVERY_LINK_GENERATED" } });
}

async function listAudit(url: URL, env: AdminEnv, requestId: string): Promise<Response> {
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return fail(400, requestId, "AUDIT_LIST_FAILURE");
  const action = url.searchParams.get("action");
  const outcome = url.searchParams.get("outcome");
  const resourceType = url.searchParams.get("resourceType");
  const resourceId = url.searchParams.get("resourceId");
  if (action && !/^[A-Z_]{3,40}$/.test(action)) return fail(400, requestId, "AUDIT_LIST_FAILURE");
  if (outcome && outcome !== "success" && outcome !== "failure") return fail(400, requestId, "AUDIT_LIST_FAILURE");
  if (resourceType && !/^[a-z_]{3,20}$/.test(resourceType)) return fail(400, requestId, "AUDIT_LIST_FAILURE");
  if (resourceId && resourceId.length > 40) return fail(400, requestId, "AUDIT_LIST_FAILURE");
  const q = url.searchParams.get("q");
  if (q && (q.length > 80 || /[\u0000-\u001F]/.test(q))) return fail(400, requestId, "AUDIT_LIST_FAILURE");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    return fail(400, requestId, "AUDIT_LIST_FAILURE");
  }
  const cursor = url.searchParams.get("cursor");
  let cursorTime = "9999-12-31T23:59:59.999Z";
  let cursorId = Number.MAX_SAFE_INTEGER;
  if (cursor) {
    const [time, idText] = atob(cursor).split("|");
    if (!time || !idText || Number.isNaN(Date.parse(time))) return fail(400, requestId, "AUDIT_LIST_FAILURE");
    cursorTime = time;
    cursorId = Number(idText);
  }
  const rows = await env.DB.prepare(
    `SELECT id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
     FROM audit_events
     WHERE (? IS NULL OR action = ?)
       AND (? IS NULL OR outcome = ?)
       AND (? IS NULL OR resource_type = ?)
       AND (? IS NULL OR resource_id = ?)
       AND (? IS NULL OR request_id = ? OR resource_id = ? OR action = ?)
       AND (? IS NULL OR occurred_at >= ?)
       AND (? IS NULL OR occurred_at <= ?)
       AND (occurred_at < ? OR (occurred_at = ? AND id < ?))
     ORDER BY occurred_at DESC, id DESC
     LIMIT ?`,
  )
    .bind(
      action,
      action,
      outcome,
      outcome,
      resourceType,
      resourceType,
      resourceId,
      resourceId,
      q,
      q,
      q,
      q,
      from,
      from,
      to,
      to,
      cursorTime,
      cursorTime,
      cursorId,
      limit + 1,
    )
    .all<Record<string, string | number | null>>();
  const page = rows.results.slice(0, limit);
  const events = page.map((row) => {
    let metadata: unknown = {};
    try {
      metadata = JSON.parse(String(row.metadata_json ?? "{}"));
    } catch {
      metadata = {};
    }
    return {
      id: row.id,
      occurredAt: row.occurred_at,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      outcome: row.outcome,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      requestId: row.request_id,
      metadata,
    };
  });
  const last = page.at(-1);
  const nextCursor = rows.results.length > limit && last ? btoa(`${String(last.occurred_at)}|${String(last.id)}`) : null;
  return Response.json({ events, nextCursor }, { headers: { "x-log-event": "AUDIT_LIST_SUCCESS" } });
}

export async function handleAdmin(request: Request, env: AdminEnv, requestId: string, now = new Date()): Promise<Response> {
  requireSecret(env, "AUDIT_HASH_SALT");
  requireSecret(env, "TURNSTILE_SECRET");
  const url = new URL(request.url);
  if (url.searchParams.has("token") || url.searchParams.has("session")) {
    return fail(400, requestId, "SECURITY_REJECTED_REQUEST");
  }
  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") return fail(405, requestId, "SECURITY_REJECTED_REQUEST");
    return login(request, env, requestId, now);
  }
  const session = await requireSession(request, env, now);
  if (url.pathname === "/api/admin/logout") {
    if (request.method !== "POST") return fail(405, requestId, "SECURITY_REJECTED_REQUEST");
    if (!session) return fail(401, requestId, "SECURITY_REJECTED_REQUEST");
    return logout(request, env, requestId, session, now);
  }
  if (!session) return fail(401, requestId, "SECURITY_REJECTED_REQUEST");
  if (url.pathname === "/api/admin/orders" && request.method === "GET") return listOrders(url, env, requestId);
  const managed = await routeCatalogAdmin(request, url, env, session, requestId, now);
  if (managed) return managed;
  const delivery = /^\/api\/admin\/orders\/(\d+)\/delivery-link$/.exec(url.pathname);
  if (delivery && request.method === "POST") {
    return deliveryLink(request, env, requestId, session, Number(delivery[1]), now);
  }
  const match = /^\/api\/admin\/orders\/(\d+)$/.exec(url.pathname);
  if (match && request.method === "GET") return orderDetail(env, requestId, Number(match[1]));
  if (match && request.method === "PATCH") return patchOrder(request, env, requestId, session, Number(match[1]), now);
  if (url.pathname === "/api/admin/audit" && request.method === "GET") return listAudit(url, env, requestId);
  return fail(404, requestId, "SECURITY_REJECTED_REQUEST");
}
