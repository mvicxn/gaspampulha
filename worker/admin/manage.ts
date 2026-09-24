import { consumeCsrfToken, CSRF_HEADER, newCsrfToken } from "../security/csrf.ts";
import { hashSecret } from "../security/session.ts";
import { assertSameOrigin } from "../security/headers.ts";
import { requireSecret } from "../security/secrets.ts";
import { readJson } from "../validate.ts";

interface AdminEnv {
  DB: D1Database;
  AUDIT_HASH_SALT?: string;
}

interface AdminSession {
  tokenHash: string;
  adminId: number;
  expiresAt: string;
}

const NAME_MAX = 80;
const PRICE_MAX = 1_000_000;
const SORT_MAX = 999;
const PIX_MAX = 77;

function pepper(env: AdminEnv): string {
  return requireSecret(env, "AUDIT_HASH_SALT");
}

function fail(status: number, requestId: string, event: string): Response {
  return Response.json(
    { error: "request_failed", request_id: requestId },
    { status, headers: { "x-log-event": event } },
  );
}

export function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > max) return null;
  if (/[\u0000-\u001F\u007F<>]/.test(trimmed)) return null;
  return trimmed;
}

export function parsePrice(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > PRICE_MAX) return null;
  return value;
}

export function parseSort(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > SORT_MAX) return null;
  return value;
}

export function parseActive(value: unknown): number | null {
  if (value === true) return 1;
  if (value === false) return 0;
  return null;
}

export function canonicalWhatsapp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[a-z:/]/i.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

export function canonicalPix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > PIX_MAX) return null;
  if (/[\u0000-\u001F\u007F\s]/.test(trimmed)) return null;
  if (/^[a-z]+:/i.test(trimmed)) return null;
  return trimmed;
}

async function readBody(request: Request, requestId: string, event: string): Promise<unknown | Response> {
  if (!assertSameOrigin(request)) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  const body = await readJson(request);
  if (!body.ok) return fail(400, requestId, event);
  return body.value;
}

async function useCsrf(
  request: Request,
  env: AdminEnv,
  session: AdminSession,
  now: Date,
  requestId: string,
): Promise<Response | null> {
  const csrf = request.headers.get(CSRF_HEADER) ?? "";
  const used = await consumeCsrfToken(env.DB, session.tokenHash, csrf, pepper(env), now.toISOString());
  if (!used) return fail(403, requestId, "SECURITY_REJECTED_REQUEST");
  return null;
}

async function nextCsrf(env: AdminEnv): Promise<{ token: string; hash: string }> {
  const token = newCsrfToken();
  return { token, hash: await hashSecret(token, `csrf:${pepper(env)}`) };
}

export async function routeCatalogAdmin(
  request: Request,
  url: URL,
  env: AdminEnv,
  session: AdminSession,
  requestId: string,
  now: Date,
): Promise<Response | null> {
  if (url.pathname === "/api/admin/products" && request.method === "GET") return listProducts(env);
  if (url.pathname === "/api/admin/products" && request.method === "POST") {
    return createProduct(request, env, session, requestId, now);
  }
  const product = /^\/api\/admin\/products\/(\d+)$/.exec(url.pathname);
  if (product && request.method === "PATCH") {
    return updateProduct(request, env, session, requestId, Number(product[1]), now);
  }
  if (url.pathname === "/api/admin/settings" && request.method === "GET") return readSettings(env);
  if (url.pathname === "/api/admin/settings" && request.method === "PUT") {
    return writeSettings(request, env, session, requestId, now);
  }
  if (url.pathname === "/api/admin/products" || url.pathname === "/api/admin/settings" || product) {
    return fail(405, requestId, "SECURITY_REJECTED_REQUEST");
  }
  return null;
}

async function listProducts(env: AdminEnv): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, name, category, price_cents, active, sort_order, version
     FROM products ORDER BY sort_order ASC, name ASC`,
  ).all<{
    id: number;
    name: string;
    category: string;
    price_cents: number;
    active: number;
    sort_order: number;
    version: number;
  }>();
  return Response.json(
    {
      products: rows.results.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        priceCents: row.price_cents,
        active: row.active === 1,
        sortOrder: row.sort_order,
        version: row.version,
      })),
    },
    { headers: { "x-log-event": "PRODUCT_LIST_SUCCESS" } },
  );
}

async function createProduct(
  request: Request,
  env: AdminEnv,
  session: AdminSession,
  requestId: string,
  now: Date,
): Promise<Response> {
  const body = await readBody(request, requestId, "PRODUCT_VALIDATION_REJECTED");
  if (body instanceof Response) return body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !["name", "category", "price_cents", "sort_order"].includes(key))) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const name = cleanLabel(fields.name, NAME_MAX);
  const price = parsePrice(fields.price_cents);
  const sortOrder = parseSort(fields.sort_order);
  if (!name || price === null || sortOrder === null || (fields.category !== "agua" && fields.category !== "gas")) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const denied = await useCsrf(request, env, session, now, requestId);
  if (denied) return denied;
  const stamp = now.toISOString();
  const csrf = await nextCsrf(env);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO products (name, category, price_cents, active, sort_order, updated_at, version)
       VALUES (?, ?, ?, 1, ?, ?, 1)`,
    ).bind(name, fields.category, price, sortOrder, stamp),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
      )
      SELECT ?, ?, 'admin', ?, 'PRODUCT_CREATED', 'product', CAST(id AS TEXT), 'success', ?, ?
      FROM products WHERE updated_at = ? AND name = ? AND version = 1
      ORDER BY id DESC LIMIT 1`,
    ).bind(crypto.randomUUID(), stamp, session.adminId, requestId, JSON.stringify({ fields_changed: ["name", "category", "price_cents", "sort_order"] }), stamp, name),
    env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
      csrf.hash,
      session.tokenHash,
      session.expiresAt,
    ),
  ]);
  return Response.json({ ok: true, csrfToken: csrf.token }, { status: 201, headers: { "x-log-event": "PRODUCT_CREATE_SUCCESS" } });
}

async function updateProduct(
  request: Request,
  env: AdminEnv,
  session: AdminSession,
  requestId: string,
  productId: number,
  now: Date,
): Promise<Response> {
  const body = await readBody(request, requestId, "PRODUCT_VALIDATION_REJECTED");
  if (body instanceof Response) return body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const fields = body as Record<string, unknown>;
  const allowed = ["name", "category", "price_cents", "active", "sort_order", "version"];
  if (Object.keys(fields).some((key) => !allowed.includes(key)) || typeof fields.version !== "number" || !Number.isInteger(fields.version)) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const current = await env.DB.prepare(
    "SELECT id, name, category, price_cents, active, sort_order, version FROM products WHERE id = ?",
  )
    .bind(productId)
    .first<{ id: number; name: string; category: string; price_cents: number; active: number; sort_order: number; version: number }>();
  if (!current) return fail(404, requestId, "PRODUCT_VALIDATION_REJECTED");
  if (current.version !== fields.version) return fail(409, requestId, "ADMIN_CONFLICT");
  const name = fields.name === undefined ? current.name : cleanLabel(fields.name, NAME_MAX);
  const category = fields.category === undefined ? current.category : fields.category;
  const price = fields.price_cents === undefined ? current.price_cents : parsePrice(fields.price_cents);
  const active = fields.active === undefined ? current.active : parseActive(fields.active);
  const sortOrder = fields.sort_order === undefined ? current.sort_order : parseSort(fields.sort_order);
  if (!name || price === null || active === null || sortOrder === null || (category !== "agua" && category !== "gas")) {
    return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  }
  const changed = [
    name !== current.name ? "name" : "",
    category !== current.category ? "category" : "",
    price !== current.price_cents ? "price_cents" : "",
    active !== current.active ? "active" : "",
    sortOrder !== current.sort_order ? "sort_order" : "",
  ].filter(Boolean);
  if (changed.length === 0) return fail(400, requestId, "PRODUCT_VALIDATION_REJECTED");
  const denied = await useCsrf(request, env, session, now, requestId);
  if (denied) return denied;
  const disabling = current.active === 1 && active === 0;
  const action = disabling ? "PRODUCT_DISABLED" : "PRODUCT_UPDATED";
  const event = disabling ? "PRODUCT_DISABLE_SUCCESS" : "PRODUCT_UPDATE_SUCCESS";
  const stamp = now.toISOString();
  const csrf = await nextCsrf(env);
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE products
       SET name = ?, category = ?, price_cents = ?, active = ?, sort_order = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND version = ?`,
    ).bind(name, category, price, active, sortOrder, stamp, productId, current.version),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
      )
      SELECT ?, ?, 'admin', ?, ?, 'product', CAST(id AS TEXT), 'success', ?, ?
      FROM products WHERE id = ? AND version = ? AND updated_at = ?`,
    ).bind(
      crypto.randomUUID(),
      stamp,
      session.adminId,
      action,
      requestId,
      JSON.stringify({ fields_changed: changed }),
      productId,
      current.version + 1,
      stamp,
    ),
    env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
      csrf.hash,
      session.tokenHash,
      session.expiresAt,
    ),
  ]);
  if ((result[0]?.meta?.changes ?? 0) !== 1) return fail(409, requestId, "ADMIN_CONFLICT");
  return Response.json({ ok: true, csrfToken: csrf.token }, { headers: { "x-log-event": event } });
}

async function readSettings(env: AdminEnv): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT key, value, version FROM settings WHERE key IN ('store_name', 'whatsapp_number', 'pix_key', 'delivery_whatsapp_number')`,
  ).all<{ key: string; value: string; version: number }>();
  const settings: Record<string, { value: string; version: number }> = {};
  for (const row of rows.results) settings[row.key] = { value: row.value, version: row.version };
  return Response.json(
    {
      storeName: settings.store_name?.value ?? "",
      whatsappNumber: settings.whatsapp_number?.value ?? "",
      pixKey: settings.pix_key?.value ?? "",
      deliveryWhatsappNumber: settings.delivery_whatsapp_number?.value ?? "",
      versions: {
        store_name: settings.store_name?.version ?? 1,
        whatsapp_number: settings.whatsapp_number?.version ?? 1,
        pix_key: settings.pix_key?.version ?? 1,
        delivery_whatsapp_number: settings.delivery_whatsapp_number?.version ?? 1,
      },
    },
    { headers: { "x-log-event": "SETTINGS_READ_SUCCESS" } },
  );
}

async function writeSettings(
  request: Request,
  env: AdminEnv,
  session: AdminSession,
  requestId: string,
  now: Date,
): Promise<Response> {
  const body = await readBody(request, requestId, "SETTINGS_VALIDATION_REJECTED");
  if (body instanceof Response) return body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !["store_name", "whatsapp_number", "pix_key", "delivery_whatsapp_number", "versions"].includes(key))) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const versions = fields.versions;
  if (typeof versions !== "object" || versions === null || Array.isArray(versions)) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const versionFields = versions as Record<string, unknown>;
  if (Object.keys(versionFields).some((key) => !["store_name", "whatsapp_number", "pix_key", "delivery_whatsapp_number"].includes(key))) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const storeName = cleanLabel(fields.store_name, NAME_MAX);
  const whatsapp = canonicalWhatsapp(fields.whatsapp_number);
  const pix = canonicalPix(fields.pix_key);
  const delivery =
    typeof fields.delivery_whatsapp_number === "string" && fields.delivery_whatsapp_number.trim() === ""
      ? ""
      : canonicalWhatsapp(fields.delivery_whatsapp_number);
  const storeVersion = versionFields.store_name;
  const whatsappVersion = versionFields.whatsapp_number;
  const pixVersion = versionFields.pix_key;
  const deliveryVersion = versionFields.delivery_whatsapp_number;
  if (
    !storeName ||
    !whatsapp ||
    pix === null ||
    delivery === null ||
    typeof storeVersion !== "number" ||
    typeof whatsappVersion !== "number" ||
    typeof pixVersion !== "number" ||
    typeof deliveryVersion !== "number"
  ) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const denied = await useCsrf(request, env, session, now, requestId);
  if (denied) return denied;
  const stamp = now.toISOString();
  const csrf = await nextCsrf(env);
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE settings
       SET value = CASE key
         WHEN 'store_name' THEN ?1
         WHEN 'whatsapp_number' THEN ?2
         WHEN 'pix_key' THEN ?3
         WHEN 'delivery_whatsapp_number' THEN ?4
       END,
       version = version + 1
       WHERE key IN ('store_name', 'whatsapp_number', 'pix_key', 'delivery_whatsapp_number')
         AND (
           SELECT COUNT(*) FROM settings
           WHERE (key = 'store_name' AND version = ?5)
              OR (key = 'whatsapp_number' AND version = ?6)
              OR (key = 'pix_key' AND version = ?7)
              OR (key = 'delivery_whatsapp_number' AND version = ?8)
         ) = 4`,
    ).bind(storeName, whatsapp, pix, delivery, storeVersion, whatsappVersion, pixVersion, deliveryVersion),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
      )
      SELECT ?, ?, 'admin', ?, 'SETTINGS_UPDATED', 'settings', 'store', 'success', ?, ?
      WHERE (
        SELECT COUNT(*) FROM settings
        WHERE (key = 'store_name' AND version = ? AND value = ?)
           OR (key = 'whatsapp_number' AND version = ?)
           OR (key = 'pix_key' AND version = ?)
           OR (key = 'delivery_whatsapp_number' AND version = ?)
      ) = 4`,
    ).bind(
      crypto.randomUUID(),
      stamp,
      session.adminId,
      requestId,
      JSON.stringify({ fields_changed: ["store_name", "whatsapp_number", "pix_key", "delivery_whatsapp_number"] }),
      storeVersion + 1,
      storeName,
      whatsappVersion + 1,
      pixVersion + 1,
      deliveryVersion + 1,
    ),
    env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
      csrf.hash,
      session.tokenHash,
      session.expiresAt,
    ),
  ]);
  if ((result[0]?.meta?.changes ?? 0) !== 4) return fail(409, requestId, "ADMIN_CONFLICT");
  return Response.json({ ok: true, csrfToken: csrf.token }, { headers: { "x-log-event": "SETTINGS_UPDATE_SUCCESS" } });
}
