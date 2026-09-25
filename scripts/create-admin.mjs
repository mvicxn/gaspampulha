import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRODUCTION_PLACEHOLDER, getDeploymentEnvironment } from "./deployment-env.mjs";

const target = getDeploymentEnvironment(process.argv[2]);
const config = readFileSync("wrangler.jsonc", "utf8");
const ids = [...config.matchAll(/"database_id":\s*"([^"]+)"/g)].map((match) => match[1]);
if (target === "preview") {
  console.error("admin de preview não usa o banco de produção");
  process.exit(1);
}
if (target === "production" && (ids[0] === PRODUCTION_PLACEHOLDER || ids[0] === ids[1])) {
  console.error("admin de produção recusado: database_id ainda é placeholder");
  process.exit(1);
}

const username = process.env.ADMIN_USERNAME ?? "";
const password = process.env.ADMIN_PASSWORD ?? "";
if (!/^[a-z0-9_]{3,32}$/.test(username) || password.length < 10 || password.length > 72) {
  console.error("Defina ADMIN_USERNAME (3-32, a-z0-9_) e ADMIN_PASSWORD (10-72) só neste comando.");
  process.exit(1);
}

const iterations = 10_000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const passwordHash = `pbkdf2-sha256$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
const directory = mkdtempSync(join(tmpdir(), "gasp-admin-"));
const file = join(directory, "admin.sql");
const safeUser = username.replaceAll("'", "''");
const safeHash = passwordHash.replaceAll("'", "''");
writeFileSync(
  file,
  `INSERT INTO admin_users (username, password_hash) VALUES ('${safeUser}', '${safeHash}');\n`,
);
const args = target === "local"
  ? ["wrangler", "d1", "execute", "gaspampulha", "--local", `--file=${file}`]
  : ["wrangler", "d1", "execute", "gaspampulha-production", "--remote", `--file=${file}`];
const result = spawnSync("npx", args, { stdio: "inherit" });
rmSync(directory, { recursive: true, force: true });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Admin ${target} criado: ${username}`);
