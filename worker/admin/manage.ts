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
const INFO_MAX = 160;
const SETTING_KEYS = [
  "store_name",
  "whatsapp_number",
  "pix_key",
  "delivery_whatsapp_number",
  "service_area",
  "opening_hours",
] as const;

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

export function cleanPublicInfo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > INFO_MAX) return null;
  if (/[\u0000-\u001F\u007F<>]/.test(trimmed)) return null;
  return trimmed;
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

const KEY_LIST = SETTING_KEYS.map((key) => `'${key}'`).join(", ");

async function readSettings(env: AdminEnv): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT key, value, version FROM settings WHERE key IN (${KEY_LIST})`).all<{
    key: string;
    value: string;
    version: number;
  }>();
  const settings: Record<string, { value: string; version: number }> = {};
  for (const row of rows.results) settings[row.key] = { value: row.value, version: row.version };
  const versions = Object.fromEntries(SETTING_KEYS.map((key) => [key, settings[key]?.version ?? 1]));
  return Response.json(
    {
      storeName: settings.store_name?.value ?? "",
      whatsappNumber: settings.whatsapp_number?.value ?? "",
      pixKey: settings.pix_key?.value ?? "",
      deliveryWhatsappNumber: settings.delivery_whatsapp_number?.value ?? "",
      serviceArea: settings.service_area?.value ?? "",
      openingHours: settings.opening_hours?.value ?? "",
      versions,
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
  if (Object.keys(fields).some((key) => key !== "versions" && !(SETTING_KEYS as readonly string[]).includes(key))) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const versions = fields.versions;
  if (typeof versions !== "object" || versions === null || Array.isArray(versions)) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const versionFields = versions as Record<string, unknown>;
  if (Object.keys(versionFields).some((key) => !(SETTING_KEYS as readonly string[]).includes(key))) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const values: Record<(typeof SETTING_KEYS)[number], string | null> = {
    store_name: cleanLabel(fields.store_name, NAME_MAX),
    whatsapp_number: canonicalWhatsapp(fields.whatsapp_number),
    pix_key: canonicalPix(fields.pix_key),
    delivery_whatsapp_number:
      typeof fields.delivery_whatsapp_number === "string" && fields.delivery_whatsapp_number.trim() === ""
        ? ""
        : canonicalWhatsapp(fields.delivery_whatsapp_number),
    service_area: cleanPublicInfo(fields.service_area),
    opening_hours: cleanPublicInfo(fields.opening_hours),
  };
  if (!values.store_name || !values.whatsapp_number) return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  if (SETTING_KEYS.some((key) => values[key] === null)) return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  const expected = SETTING_KEYS.map((key) => versionFields[key]);
  if (expected.some((version) => typeof version !== "number" || !Number.isInteger(version))) {
    return fail(400, requestId, "SETTINGS_VALIDATION_REJECTED");
  }
  const denied = await useCsrf(request, env, session, now, requestId);
  if (denied) return denied;
  const stamp = now.toISOString();
  const csrf = await nextCsrf(env);
  const count = SETTING_KEYS.length;
  const cases = SETTING_KEYS.map((key, index) => `WHEN '${key}' THEN ?${index + 1}`).join("\n         ");
  const guard = SETTING_KEYS.map((key, index) => `(key = '${key}' AND version = ?${count + index + 1})`).join("\n              OR ");
  const after = SETTING_KEYS.map((key) => (key === "store_name" ? `(key = '${key}' AND version = ? AND value = ?)` : `(key = '${key}' AND version = ?)`)).join("\n           OR ");
  const afterBinds = SETTING_KEYS.flatMap((key, index) => {
    const next = (expected[index] as number) + 1;
    return key === "store_name" ? [next, values.store_name] : [next];
  });
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE settings
       SET value = CASE key
         ${cases}
       END,
       version = version + 1
       WHERE key IN (${KEY_LIST})
         AND (
           SELECT COUNT(*) FROM settings
           WHERE ${guard}
         ) = ${count}`,
    ).bind(...SETTING_KEYS.map((key) => values[key]), ...expected),
    env.DB.prepare(
      `INSERT INTO audit_events (
        event_id, occurred_at, actor_type, actor_id, action, resource_type, resource_id, outcome, request_id, metadata_json
      )
      SELECT ?, ?, 'admin', ?, 'SETTINGS_UPDATED', 'settings', 'store', 'success', ?, ?
      WHERE (
        SELECT COUNT(*) FROM settings
        WHERE ${after}
      ) = ${count}`,
    ).bind(
      crypto.randomUUID(),
      stamp,
      session.adminId,
      requestId,
      JSON.stringify({ fields_changed: SETTING_KEYS }),
      ...afterBinds,
    ),
    env.DB.prepare("INSERT INTO csrf_tokens (token_hash, session_token_hash, expires_at) VALUES (?, ?, ?)").bind(
      csrf.hash,
      session.tokenHash,
      session.expiresAt,
    ),
  ]);
  if ((result[0]?.meta?.changes ?? 0) !== count) return fail(409, requestId, "ADMIN_CONFLICT");
  return Response.json({ ok: true, csrfToken: csrf.token }, { headers: { "x-log-event": "SETTINGS_UPDATE_SUCCESS" } });
}
