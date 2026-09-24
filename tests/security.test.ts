import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditEvent } from "../worker/audit.ts";
import worker from "../worker/index.ts";
import { formatLog, newRequestId, redact } from "../worker/log.ts";
import { canChangeOrderStatus, canChangePaymentStatus } from "../worker/order-status.ts";
import {
  authPolicy,
  clearAuthFailures,
  registerFailure,
  type AuthAttemptStore,
  type AuthSubjects,
  type AuthWindow,
} from "../worker/security/auth-guard.ts";
import { isSafeRelativePath, securityHeaders, withSecurityHeaders } from "../worker/security/headers.ts";
import { clearSessionCookie, sessionCookie } from "../worker/security/session.ts";
import { parseFields, qtyField, readJson } from "../worker/validate.ts";

test("redige segredo, telefone e endereço", () => {
  const clean = redact({
    password: "123",
    password_hash: "abc",
    token: "sess",
    authorization: "Bearer x",
    turnstileToken: "t",
    phone: "31999999999",
    street: "Rua A",
    event: "ORDER_CREATED",
  }) as Record<string, string>;
  assert.equal(clean.password, "[redacted]");
  assert.equal(clean.password_hash, "[redacted]");
  assert.equal(clean.token, "[redacted]");
  assert.equal(clean.authorization, "[redacted]");
  assert.equal(clean.turnstileToken, "[redacted]");
  assert.equal(clean.phone, "[redacted]");
  assert.equal(clean.street, "[redacted]");
  assert.equal(clean.event, "ORDER_CREATED");
});

test("request_id é uuid e o log não carrega cookie", () => {
  const id = newRequestId();
  assert.match(id, /^[0-9a-f-]{36}$/);
  const line = formatLog({
    request_id: id,
    timestamp: "2026-01-01T00:00:00.000Z",
    event: "request",
    level: "info",
    cookie: "segredo",
  } as never);
  assert.equal(line.includes("segredo"), false);
  assert.equal(line.includes("[redacted]"), true);
});

function assertBaselineHeaders(response: Response) {
  const csp = response.headers.get("Content-Security-Policy") ?? "";
  assert.equal(csp.includes("script-src *"), false);
  assert.equal(csp.includes("connect-src *"), false);
  assert.equal(csp.includes("https://challenges.cloudflare.com"), true);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("Permissions-Policy")?.includes("camera=()"), true);
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(securityHeaders["X-Frame-Options"], "DENY");
}

test("resposta do Worker traz security headers sem ler _headers", async () => {
  const assetRules = readFileSync("public/_headers", "utf8");
  assert.equal(assetRules.includes("/api"), false);
  assert.equal(assetRules.includes("Strict-Transport-Security"), false);
  const local = await worker.fetch(new Request("http://127.0.0.1/api/health"), {} as never);
  assert.equal(local.status, 200);
  assertBaselineHeaders(local);
  assert.equal(local.headers.get("Strict-Transport-Security"), null);
  const production = withSecurityHeaders(
    Response.json({ ok: true }),
    new Request("https://gaspampulha.workers.dev/api/health"),
  );
  assertBaselineHeaders(production);
  assert.equal(production.headers.get("Strict-Transport-Security")?.includes("max-age="), true);
  const loopbackHttps = withSecurityHeaders(
    Response.json({ ok: true }),
    new Request("https://localhost/api/health"),
  );
  assert.equal(loopbackHttps.headers.get("Strict-Transport-Security"), null);
});

test("cookie de sessão não tem Domain e o clear expira", () => {
  const set = sessionCookie("abc");
  assert.match(set, /__Host-admin_session=abc/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /Secure/);
  assert.match(set, /SameSite=Lax/);
  assert.equal(set.toLowerCase().includes("domain="), false);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test("recusa url externa e campo desconhecido", () => {
  assert.equal(isSafeRelativePath("/admin"), true);
  assert.equal(isSafeRelativePath("https://evil.test"), false);
  assert.equal(isSafeRelativePath("//evil.test"), false);
  const parsed = parseFields(
    { qty: 2, price_cents: 1 },
    { qty: qtyField },
  );
  assert.equal(parsed.ok, false);
});

test("limite de corpo e content-type", async () => {
  const wrong = await readJson(new Request("https://app.local/api/orders", { method: "POST", body: "{}" }));
  assert.equal(wrong.ok, false);
  const big = await readJson(
    new Request("https://app.local/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(9000),
    }),
    100,
  );
  assert.equal(big.ok, false);
});

test("transições de pedido e pagamento", () => {
  assert.equal(canChangeOrderStatus("novo", "confirmado"), true);
  assert.equal(canChangeOrderStatus("novo", "entregue"), false);
  assert.equal(canChangeOrderStatus("entregue", "cancelado"), false);
  assert.equal(canChangePaymentStatus("pendente", "pago"), true);
  assert.equal(canChangePaymentStatus("pago", "pendente"), false);
});

function memoryStore() {
  const rows = new Map<string, AuthWindow>();
  const store: AuthAttemptStore = {
    async get(subjectHash) {
      return rows.get(subjectHash) ?? null;
    },
    async save(window) {
      rows.set(window.subjectHash, window);
    },
    async clear(subjectHash) {
      rows.delete(subjectHash);
    },
  };
  return store;
}

test("auth aplica backoff, bloqueio temporário e não trava o admin para sempre", async () => {
  const store = memoryStore();
  const subjects: AuthSubjects = { userHash: "admin", originHash: "origem-a" };
  const start = new Date("2026-01-01T00:00:00.000Z");
  const first = await registerFailure(store, subjects, start);
  const second = await registerFailure(store, subjects, start);
  assert.equal(first.allowed, true);
  assert.equal(first.turnstileRequired, false);
  assert.equal(second.allowed, true);
  assert.equal(second.turnstileRequired, false);

  const third = await registerFailure(store, subjects, start);
  assert.equal(third.allowed, false);
  assert.equal(third.turnstileRequired, true);
  assert.equal(third.retryAfterMs, authPolicy.backoffMs[3]);
  assert.equal(third.blocked, false);
  assert.equal(third.audit, true);

  const afterThird = new Date(start.getTime() + authPolicy.backoffMs[3]);
  const fourth = await registerFailure(store, subjects, afterThird);
  assert.equal(fourth.retryAfterMs, authPolicy.backoffMs[4]);
  const afterFourth = new Date(afterThird.getTime() + authPolicy.backoffMs[4]);
  const fifth = await registerFailure(store, subjects, afterFourth);
  assert.equal(fifth.retryAfterMs, authPolicy.backoffMs[5]);
  assert.equal(fifth.blocked, false);

  const afterFifth = new Date(afterFourth.getTime() + authPolicy.backoffMs[5]);
  const sixth = await registerFailure(store, subjects, afterFifth);
  assert.equal(sixth.blocked, true);
  assert.equal(sixth.retryAfterMs, authPolicy.originBlockMs);
  const duringBlock = await registerFailure(store, subjects, new Date(afterFifth.getTime() + 1_000));
  assert.equal(duringBlock.retryAfterMs < authPolicy.originBlockMs, true);
  assert.equal(duringBlock.audit, false);

  const otherOrigin = await registerFailure(
    store,
    { userHash: "admin", originHash: "origem-b" },
    afterFifth,
  );
  assert.equal(otherOrigin.blocked, false);
  assert.equal(otherOrigin.retryAfterMs <= authPolicy.userBackoffMs, true);

  const later = new Date(afterFifth.getTime() + authPolicy.windowMs + 1_000);
  const reset = await registerFailure(store, subjects, later);
  assert.equal(reset.allowed, true);
  assert.equal(reset.blocked, false);
  assert.equal(reset.turnstileRequired, false);

  await registerFailure(store, subjects, later);
  await clearAuthFailures(store, subjects);
  const afterClear = await registerFailure(store, subjects, later);
  assert.equal(afterClear.allowed, true);
  assert.equal(afterClear.turnstileRequired, false);
});

test("audit grava só por binding", async () => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              calls.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
  await auditEvent(db as unknown as D1Database, {
    action: "SECURITY_REJECTED_REQUEST",
    outcome: "failure",
    actorType: "anonymous",
    requestId: "req",
    metadata: { reason: "origin" },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sql.includes("?"), true);
  assert.equal(calls[0].sql.includes("origin"), false);
  assert.equal(calls[0].args[4], "SECURITY_REJECTED_REQUEST");
});
