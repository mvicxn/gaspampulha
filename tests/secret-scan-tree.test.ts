import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function scan(root: string) {
  return spawnSync("node", ["scripts/secret-scan.mjs", root], { encoding: "utf8" });
}

test("secret untracked falha e arquivo normal passa", () => {
  const root = mkdtempSync(join(tmpdir(), "gasp-scan-"));
  writeFileSync(join(root, "nota.txt"), "pedido sem segredo\n");
  const clean = scan(root);
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /nenhum achado/);
  writeFileSync(join(root, ".env"), "TURNSTILE_SECRET=fake-value-not-real\n");
  const failed = scan(root);
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /generic-secret-assignment \.env:1/);
  assert.equal(failed.stdout.includes("fake-value-not-real"), false);
  rmSync(root, { recursive: true, force: true });
});
