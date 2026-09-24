import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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
const target = process.argv[2];
if (target !== "preview" && target !== "production") {
  console.error("Use: node scripts/guard-remote.mjs preview|production");
  process.exit(1);
}
const config = readFileSync("wrangler.jsonc", "utf8");
const ids = [...config.matchAll(/"database_id":\s*"([^"]+)"/g)].map((match) => match[1]);
const zero = "00000000-0000-0000-0000-000000000000";
const previewPlaceholder = "00000000-0000-0000-0000-000000000001";
if (target === "production" && ids.includes(zero)) {
  console.error("database_id de produção ainda é placeholder. Não houve deploy.");
  process.exit(1);
}
if (target === "preview" && ids.includes(previewPlaceholder)) {
  console.error("database_id de preview ainda é placeholder. Não houve deploy.");
  process.exit(1);
}
if (new Set(ids).size !== ids.length) {
  console.error("preview e produção não podem apontar para o mesmo database_id.");
  process.exit(1);
}
const testSiteKey = "1x00000000000000000000AA";
const topLevelSiteKey = config.match(/"vars":\s*\{[^}]*"TURNSTILE_SITEKEY":\s*"([^"]+)"/);
if (target === "production" && topLevelSiteKey?.[1] === testSiteKey) {
  console.error("produção ainda usa a sitekey de teste do Turnstile. Não houve deploy.");
  process.exit(1);
}
if (/"TURNSTILE_SECRET"\s*:/.test(config) || /"AUDIT_HASH_SALT"\s*:/.test(config)) {
  console.error("secret não pode estar em vars. Não houve deploy.");
  process.exit(1);
}
if (!config.includes('"TURNSTILE_SECRET"') || !config.includes('"AUDIT_HASH_SALT"')) {
  console.error("secrets.required não declara TURNSTILE_SECRET e AUDIT_HASH_SALT.");
  process.exit(1);
}
const args = target === "preview" ? ["wrangler", "preview"] : ["wrangler", "deploy"];
const result = spawnSync("npx", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
