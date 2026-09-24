import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const patterns = [
  { name: "turnstile-test-secret", re: /1x0000000000000000000000000000000AA/ },
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "aws-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "slack-token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "generic-secret-assignment", re: /(TURNSTILE_SECRET|AUDIT_HASH_SALT|ADMIN_PASSWORD)[ \t]*=[ \t]*\S{8,}/ },
];

const hits = [];
const skip = new Set([
  "scripts/secret-scan.mjs",
  "scripts/assert-no-secrets-in-assets.mjs",
  "tests/assets-scan.test.ts",
]);
const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !skip.has(line));

for (const path of files) {
  const text = readFileSync(path, "utf8");
  for (const pattern of patterns) {
    if (pattern.re.test(text)) hits.push(`${pattern.name} ${path}`);
  }
}
if (hits.length === 0) {
  console.log("secret-scan: nenhum achado em arquivos versionáveis da árvore de trabalho");
} else {
  console.log(hits.join("\n"));
  process.exitCode = 1;
}
