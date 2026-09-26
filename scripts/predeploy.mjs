import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { TEST_SITEKEY, TEST_TURNSTILE_SECRETS, PRODUCTION_PLACEHOLDER, remoteSecretNames } from "./deployment-env.mjs";

if (process.argv[2] !== "--check") {
  console.error("predeploy só roda em modo --check. Não houve deploy.");
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const dirty = execSync("git status --porcelain", { encoding: "utf8" }).trim();
if (dirty) fail("git não está limpo");

const config = readFileSync("wrangler.jsonc", "utf8");
if (!/"preview_urls"\s*:\s*false/.test(config)) fail("preview_urls não é false");
if (!/"workers_dev"\s*:\s*true/.test(config)) fail("workers_dev não é true");
if (/versions upload|versions deploy/.test(config)) fail("fluxo de Version URL no config");

const ids = [...config.matchAll(/"database_id":\s*"([^"]+)"/g)].map((match) => match[1]);
const siteKeys = [...config.matchAll(/"TURNSTILE_SITEKEY":\s*"([^"]+)"/g)].map((match) => match[1]);
if (ids[0] === PRODUCTION_PLACEHOLDER || ids[0] === ids[1]) fail("D1 de produção inválido");
if (!siteKeys[0] || siteKeys[0] === TEST_SITEKEY) fail("sitekey de produção inválida");
if (siteKeys[1] !== TEST_SITEKEY) fail("sitekey de preview não é a de teste");

const incident = readFileSync("docs/incident-response.md", "utf8");
if (!incident.includes("CLOSED")) fail("incidente não está fechado");

if (process.env.GASP_KEEP_REMOTE_SECRETS === "1") {
  const names = remoteSecretNames();
  if (!names.includes("TURNSTILE_SECRET") || !names.includes("AUDIT_HASH_SALT")) fail("Worker de produção sem os secrets obrigatórios");
} else {
  const secretsFile = process.env.GASP_SECRETS_FILE ?? "/tmp/gaspampulha-production-secrets.env";
  if (!existsSync(secretsFile) || secretsFile.startsWith("/home/mm-lab-corp/gaspampulha")) fail("arquivo de secrets de produção ausente");
  const secretMap = Object.fromEntries(readFileSync(secretsFile, "utf8").split("\n").filter((line) => line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  const saltPrefix = "AUDIT_HASH_" + "SALT=";
  const localSalt = readFileSync(".dev.vars", "utf8").split("\n").find((line) => line.startsWith(saltPrefix))?.slice(saltPrefix.length) ?? "";
  if (!secretMap.TURNSTILE_SECRET || !secretMap.AUDIT_HASH_SALT) fail("nomes de secret de produção ausentes");
  if (TEST_TURNSTILE_SECRETS.includes(secretMap.TURNSTILE_SECRET)) fail("secret de produção ainda é de teste");
  if (secretMap.AUDIT_HASH_SALT === localSalt || secretMap.AUDIT_HASH_SALT.length < 32) fail("salt de produção inválido");
}

execSync("npm test", { stdio: "inherit" });
execSync("npm run build", { stdio: "inherit" });
execSync("npm run secret-scan", { stdio: "inherit" });
console.log("predeploy: checks ok. Nenhum deploy foi executado.");
