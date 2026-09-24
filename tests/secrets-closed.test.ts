import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import worker from "../worker/index.ts";
import { requireSecret } from "../worker/security/secrets.ts";

test("secret ausente falha fechado e o fallback antigo não existe", async () => {
  assert.throws(() => requireSecret({}, "AUDIT_HASH_SALT"), /missing_secret/);
  assert.throws(() => requireSecret({ AUDIT_HASH_SALT: "  " }, "AUDIT_HASH_SALT"), /missing_secret/);
  assert.throws(() => requireSecret({}, "TURNSTILE_SECRET"), /missing_secret/);
  const order = await worker.fetch(
    new Request("https://loja.test/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { DB: {} } as never,
  );
  const orderText = await order.text();
  assert.equal(order.status, 500);
  assert.equal(orderText.includes("gaspampulha-" + "audit-v1"), false);
  assert.match(orderText, /"request_id":/);
  const admin = await worker.fetch(new Request("https://loja.test/api/admin/login", { method: "POST" }), {
    DB: {},
  } as never);
  assert.equal(admin.status, 500);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === "dist-tests" || name === ".git") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx|mjs|md|jsonc)$/.test(name)) files.push(path);
    }
  };
  walk(".");
  const banned = "gaspampulha-" + "audit-v1";
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    assert.equal(text.includes(banned), false, path);
  }
});
