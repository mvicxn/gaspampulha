import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { PRODUCTION_PLACEHOLDER, TEST_SITEKEY, TEST_TURNSTILE_SECRETS, assertDeployment, assertPreviewUrlsOff, assertRemoteVersionUrlsOff } from "./deployment-env.mjs";
import { scanTree } from "./secret-scan.mjs";

function readRemotePreviewState() {
  const toml = readFileSync(`${homedir()}/.config/.wrangler/config/default.toml`, "utf8");
  const token = toml.split("oauth_token = ")[1]?.split("\n")[0]?.trim().replaceAll('"', "");
  if (!token) return undefined;
  const result = spawnSync("curl", [
    "-sS",
    "--max-time",
    "20",
    "-H",
    `Authorization: Bearer ${token}`,
    "https://api.cloudflare.com/client/v4/accounts/8690b830da0b2d1acd9184f2b88ca6cd/workers/scripts/gaspampulha/subdomain",
  ], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  try {
    return JSON.parse(result.stdout).result;
  } catch {
    return undefined;
  }
}

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
  try {
    assertPreviewUrlsOff(config);
    assertRemoteVersionUrlsOff(readRemotePreviewState());
  } catch {
    console.error("Version URLs locais ou remotas não estão desligadas. Não houve deploy.");
    process.exit(1);
  }
  if (productionId === PRODUCTION_PLACEHOLDER || names[0] !== "gaspampulha-production") {
    console.error("database_id de produção ainda é placeholder. Não houve deploy.");
    process.exit(1);
  }
  if (!/"workers_dev"\s*:\s*true/.test(config)) {
    console.error("produção do MVP precisa de workers_dev true. Não houve deploy.");
    process.exit(1);
  }
  if (!productionSiteKey || productionSiteKey === TEST_SITEKEY) {
    console.error("produção ainda usa a sitekey de teste do Turnstile. Não houve deploy.");
    process.exit(1);
  }
  if (process.env.GASP_CONFIRM_DEPLOY !== productionId) {
    console.error("deploy de produção exige GASP_CONFIRM_DEPLOY igual ao database_id. Não houve deploy.");
    process.exit(1);
  }
  const secretsFile = process.env.GASP_SECRETS_FILE ?? "";
  if (!secretsFile || secretsFile.startsWith("/home/mm-lab-corp/gaspampulha")) {
    console.error("secret de produção ausente. Não houve deploy.");
    process.exit(1);
  }
  const secretText = readFileSync(secretsFile, "utf8");
  const secretMap = Object.fromEntries(secretText.split("\n").filter((line) => line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  const saltPrefix = "AUDIT_HASH_" + "SALT=";
  const localSalt = readFileSync(".dev.vars", "utf8").split("\n").find((line) => line.startsWith(saltPrefix))?.slice(saltPrefix.length) ?? "";
  if (!secretMap.TURNSTILE_SECRET || !secretMap.AUDIT_HASH_SALT || TEST_TURNSTILE_SECRETS.includes(secretMap.TURNSTILE_SECRET) || secretMap.AUDIT_HASH_SALT === localSalt) {
    console.error("secret de produção ausente, de teste, ou igual ao salt local. Não houve deploy.");
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
const args = target === "preview"
  ? ["wrangler", "preview"]
  : ["wrangler", "deploy", "--secrets-file", process.env.GASP_SECRETS_FILE];
const result = spawnSync("npx", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
