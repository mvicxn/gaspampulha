import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PRODUCTION_PLACEHOLDER, TEST_SITEKEY, TEST_TURNSTILE_SECRETS, assertDeployment } from "./deployment-env.mjs";
import { scanTree } from "./secret-scan.mjs";

const requiredSecrets = ["TURNSTILE_SECRET", "AUDIT_HASH_SALT"];
if (!existsSync(".dev.vars")) {
  console.error("secret obrigatório ausente: .dev.vars não existe");
  process.exit(1);
}
const present = new Set(
  readFileSync(".dev.vars", "utf8")
    .split("\n")
    .map((line) => line.split("=")[0]?.trim())
    .filter((key) => key && !key.startsWith("#")),
);
for (const name of requiredSecrets) {
  if (!present.has(name)) {
    console.error(`secret obrigatório ausente: ${name}`);
    process.exit(1);
  }
}
if (process.argv.length !== 3 || process.argv[2].startsWith("-")) {
  console.error("alvo ambíguo. Não houve deploy.");
  process.exit(1);
}
const destructive = /delete|drop|reset/i;
if (process.argv.slice(2).some((arg) => destructive.test(arg))) {
  console.error("comando destrutivo recusado");
  process.exit(1);
}
const target = process.argv[2];
if (target !== "preview" && target !== "production" && target !== "production-migrate" && target !== "production-admin") {
  console.error("Use: node scripts/guard-remote.mjs preview|production|production-migrate|production-admin");
  process.exit(1);
}
const config = readFileSync("wrangler.jsonc", "utf8");
const ids = [...config.matchAll(/"database_id":\s*"([^"]+)"/g)].map((match) => match[1]);
const names = [...config.matchAll(/"database_name":\s*"([^"]+)"/g)].map((match) => match[1]);
const productionId = ids[0];
const previewId = ids[1];
if (!productionId || !previewId || productionId === previewId) {
  console.error("preview e produção não podem apontar para o mesmo database_id.");
  process.exit(1);
}
const siteKeys = [...config.matchAll(/"TURNSTILE_SITEKEY":\s*"([^"]+)"/g)].map((match) => match[1]);
const productionSiteKey = siteKeys[0];
const previewSiteKey = siteKeys[1] ?? siteKeys[0];
if (target === "preview") {
  try {
    assertDeployment({
      target: "preview",
      databaseId: previewId,
      databaseName: names[1],
      productionDatabaseId: productionId,
      siteKey: previewSiteKey,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "preview inconsistente");
    process.exit(1);
  }
}
if (target.startsWith("production")) {
  if (productionId === PRODUCTION_PLACEHOLDER || names[0] !== "gaspampulha-production") {
    console.error("database_id de produção ainda é placeholder. Não houve deploy.");
    process.exit(1);
  }
  if (productionSiteKey === TEST_SITEKEY) {
    console.error("produção ainda usa a sitekey de teste do Turnstile. Não houve deploy.");
    process.exit(1);
  }
  const secretPrefix = ["TURNSTILE", "SECRET"].join("_") + "=";
  const assigned = readFileSync(".dev.vars", "utf8")
    .split("\n")
    .find((line) => line.startsWith(secretPrefix));
  const secretValue = assigned?.slice(secretPrefix.length).trim() ?? "";
  if (!secretValue || TEST_TURNSTILE_SECRETS.includes(secretValue)) {
    console.error("secret de produção ausente ou ainda é a de teste. Não houve deploy.");
    process.exit(1);
  }
  if (!existsSync("dist") || scanTree("dist").length > 0) {
    console.error("build ausente ou com segredo. Não houve deploy.");
    process.exit(1);
  }
}
if (/"TURNSTILE_SECRET"\s*:/.test(config) || /"AUDIT_HASH_SALT"\s*:/.test(config)) {
  console.error("secret não pode estar em vars. Não houve deploy.");
  process.exit(1);
}
if (!config.includes('"TURNSTILE_SECRET"') || !config.includes('"AUDIT_HASH_SALT"')) {
  console.error("secrets.required não declara TURNSTILE_SECRET e AUDIT_HASH_SALT.");
  process.exit(1);
}
if (target !== "preview" && target !== "production") {
  console.error("migration e admin de produção não rodam por este script");
  process.exit(1);
}
const args = target === "preview" ? ["wrangler", "preview"] : ["wrangler", "deploy"];
const result = spawnSync("npx", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
