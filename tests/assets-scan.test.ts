import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function scan(root: string) {
  return spawnSync("node", ["scripts/assert-no-secrets-in-assets.mjs", root], { encoding: "utf8" });
}

test("scanner falha com arquivo falso e passa depois da remoção", () => {
  const root = mkdtempSync(join(tmpdir(), "gasp-assets-"));
  const secretFile = join(root, ".dev.vars");
  writeFileSync(secretFile, "TURNSTILE_SECRET=fake-value-not-real\n");
  const failed = scan(root);
  assert.equal(failed.status, 1);
  assert.equal(failed.stderr.includes("forbidden-file"), true);
  assert.equal(failed.stderr.includes("fake-value-not-real"), false);
  assert.equal(failed.stdout.includes("fake-value-not-real"), false);
  rmSync(secretFile);
  writeFileSync(join(root, "worker.js"), "const name = env.TURNSTILE_SECRET ?? \"\";\n");
  const passed = scan(root);
  assert.equal(passed.status, 0);
  rmSync(root, { recursive: true, force: true });
});
