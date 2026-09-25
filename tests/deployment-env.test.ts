import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const previewId = "6fb672ad-dae3-424c-b01f-b287b1ea2aa5";
const placeholder = "00000000-0000-0000-0000-000000000000";
const productionId = "11111111-1111-4111-8111-111111111111";
const testSite = "1x00000000000000000000AA";
const passSecret = "1x0000000000000000000000000000000AA";

function check(spec: Record<string, string>): { status: number; stderr: string } {
  const result = spawnSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      `import { assertDeployment } from "./scripts/deployment-env.mjs";
       try { assertDeployment(${JSON.stringify(spec)}); }
       catch (error) { console.error(error.message); process.exit(1); }`,
    ],
    { encoding: "utf8" },
  );
  return { status: result.status ?? 1, stderr: result.stderr };
}

test("produção com placeholder aborta", () => {
  const result = check({
    target: "production",
    databaseId: placeholder,
    databaseName: "gaspampulha-production",
    previewDatabaseId: previewId,
    siteKey: "real-sitekey",
    turnstileSecret: "real-secret-value",
    auditSalt: "production-salt-value",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production-placeholder/);
});

test("produção não pode usar o banco de preview", () => {
  const result = check({
    target: "production",
    databaseId: previewId,
    databaseName: "gaspampulha-production",
    previewDatabaseId: previewId,
    siteKey: "real-sitekey",
    turnstileSecret: "real-secret-value",
    auditSalt: "production-salt-value",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production-uses-preview-db/);
});

test("preview não pode usar o banco de produção", () => {
  const result = check({
    target: "preview",
    databaseId: productionId,
    databaseName: "gaspampulha-preview",
    productionDatabaseId: productionId,
    siteKey: testSite,
    turnstileSecret: passSecret,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /preview-uses-production-db/);
});

test("produção com Turnstile de teste aborta", () => {
  const result = check({
    target: "production",
    databaseId: productionId,
    databaseName: "gaspampulha-production",
    previewDatabaseId: previewId,
    siteKey: testSite,
    turnstileSecret: passSecret,
    auditSalt: "production-salt-value",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /production-test-turnstile/);
});

test("produção sem secret aborta", () => {
  const result = check({
    target: "production",
    databaseId: productionId,
    databaseName: "gaspampulha-production",
    previewDatabaseId: previewId,
    siteKey: "real-sitekey",
    turnstileSecret: "",
    auditSalt: "",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing-production-secret/);
});

test("preview com secret de produção aborta", () => {
  const result = check({
    target: "preview",
    databaseId: previewId,
    databaseName: "gaspampulha-preview",
    productionDatabaseId: placeholder,
    siteKey: testSite,
    turnstileSecret: "real-production-secret",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /preview-uses-production-secret/);
});

test("alvo desconhecido é ambíguo", () => {
  const result = check({ target: "staging" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ambiente ambíguo/);
});

test("estado remoto desconhecido aborta Version URL", () => {
  const failed = spawnSync(
    "node",
    ["--input-type=module", "--eval", `import { assertRemoteVersionUrlsOff } from "./scripts/deployment-env.mjs";
      try { assertRemoteVersionUrlsOff(undefined); process.exit(0); } catch { process.exit(1); }`],
    { encoding: "utf8" },
  );
  const passed = spawnSync(
    "node",
    ["--input-type=module", "--eval", `import { assertRemoteVersionUrlsOff } from "./scripts/deployment-env.mjs";
      assertRemoteVersionUrlsOff({ previews_enabled: false });`],
    { encoding: "utf8" },
  );
  assert.equal(failed.status, 1);
  assert.equal(passed.status, 0);
});

test("preview_urls true aborta e false passa", () => {
  const failed = spawnSync(
    "node",
    ["--input-type=module", "--eval", `import { assertPreviewUrlsOff } from "./scripts/deployment-env.mjs";
      try { assertPreviewUrlsOff('{"preview_urls": true}'); process.exit(0); }
      catch { process.exit(1); }`],
    { encoding: "utf8" },
  );
  const passed = spawnSync(
    "node",
    ["--input-type=module", "--eval", `import { assertPreviewUrlsOff } from "./scripts/deployment-env.mjs";
      assertPreviewUrlsOff('{"preview_urls": false}');`],
    { encoding: "utf8" },
  );
  assert.equal(failed.status, 1);
  assert.equal(passed.status, 0);
});

test("admin de produção no placeholder aborta antes do wrangler", () => {
  const result = spawnSync("node", ["scripts/create-admin.mjs", "production"], {
    encoding: "utf8",
    env: { ...process.env, ADMIN_USERNAME: "operador", ADMIN_PASSWORD: "preview-operador-123" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ADMIN_CONFIRM/);
  assert.equal(result.stdout.includes("wrangler"), false);
});
