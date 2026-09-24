import assert from "node:assert/strict";
import test from "node:test";
import { handleAdmin } from "../worker/admin/http.ts";
import { gateFromRows } from "../worker/security/login-attempt.ts";
import { hashPassword, verifyPassword } from "../worker/security/password.ts";
import { canChangeOrderStatus, canChangePaymentStatus } from "../worker/order-status.ts";
import { formatLog } from "../worker/log.ts";

test("hash não é a senha e a verificação distingue acerto e erro", async () => {
  const stored = await hashPassword("senha-local-123");
  assert.equal(stored.includes("senha-local-123"), false);
  assert.equal(stored.startsWith("pbkdf2-sha256$10000$"), true);
  assert.equal(await verifyPassword("senha-local-123", stored), true);
  assert.equal(await verifyPassword("outra-senha-123", stored), false);
});

test("transições proibidas e pagamento só seguem para pago", () => {
  assert.equal(canChangeOrderStatus("novo", "confirmado"), true);
  assert.equal(canChangeOrderStatus("entregue", "novo"), false);
  assert.equal(canChangeOrderStatus("saiu", "entregue"), true);
  assert.equal(canChangePaymentStatus("pendente", "pago"), true);
  assert.equal(canChangePaymentStatus("pago", "pendente"), false);
});

test("painel sem sessão responde 401 e token na URL é rejeitado", async () => {
  const db = { prepare() { throw new Error("sem consulta"); } };
  const env = {
    DB: db as unknown as D1Database,
    TURNSTILE_SECRET: "present",
    AUDIT_HASH_SALT: "present",
  };
  const list = await handleAdmin(new Request("https://loja.test/api/admin/orders"), env, "req-admin");
  assert.equal(list.status, 401);
  const body = (await list.json()) as { request_id: string };
  assert.equal(body.request_id, "req-admin");
  const fixation = await handleAdmin(
    new Request("https://loja.test/api/admin/login?token=abc", { method: "POST" }),
    env,
    "req-fix",
  );
  assert.equal(fixation.status, 400);
});

test("duas falhas seriadas no mesmo mapa chegam a 2", async () => {
  const rows = new Map<string, { attempt_count: number; blocked_until: string | null; window_started_at: string }>();
  let queue = Promise.resolve();
  function bump(key: string) {
    const run = queue.then(() => {
      const current = rows.get(key);
      const next = {
        attempt_count: (current?.attempt_count ?? 0) + 1,
        blocked_until: null,
        window_started_at: current?.window_started_at ?? "2026-01-01T00:00:00.000Z",
      };
      rows.set(key, next);
      return next;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  await Promise.all([bump("uo:user:a"), bump("uo:user:a")]);
  assert.equal(rows.get("uo:user:a")?.attempt_count, 2);
  const gate = gateFromRows(
    {
      subject_hash: "uo",
      window_started_at: "2026-01-01T00:00:00.000Z",
      attempt_count: 2,
      blocked_until: null,
    },
    {
      subject_hash: "user",
      window_started_at: "2026-01-01T00:00:00.000Z",
      attempt_count: 2,
      blocked_until: null,
    },
    new Date("2026-01-01T00:00:00.000Z"),
  );
  assert.equal(gate.allowed, true);
  assert.equal(gate.turnstileRequired, false);
});

test("log de admin não carrega senha nem csrf", () => {
  const line = formatLog({
    request_id: "req",
    timestamp: "2026-01-01T00:00:00.000Z",
    event: "ADMIN_LOGIN_SUCCESS",
    level: "info",
    password: "segredo",
    csrf: "token-secreto",
  } as never);
  assert.equal(line.includes("segredo"), false);
  assert.equal(line.includes("token-secreto"), false);
});
