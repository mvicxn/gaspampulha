import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.ts";

test("erro público não vaza stack e não é cache público", async () => {
  const response = await worker.fetch(new Request("http://127.0.0.1/api/nao-existe"), {} as never);
  const text = await response.text();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(text.includes("stack"), false);
  assert.equal(text.includes("D1"), false);
  assert.match(text, /"request_id":"[0-9a-f-]{36}"/);
});
