import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const patterns = [
  { name: "turnstile-test-secret", re: /1x0000000000000000000000000000000AA/ },
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "aws-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "slack-token", re: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { name: "generic-secret-assignment", re: /(TURNSTILE_SECRET|AUDIT_HASH_SALT|ADMIN_PASSWORD)[ \t]*=[ \t]*\S{8,}/ },
];

const skipDirs = new Set([".git", "node_modules", ".wrangler", "dist", "dist-tests", "dist-ssr"]);
const skipFiles = new Set([
  "scripts/secret-scan.mjs",
  "scripts/assert-no-secrets-in-assets.mjs",
  "scripts/deployment-env.mjs",
  "tests/assets-scan.test.ts",
  "tests/deployment-env.test.ts",
  "tests/secret-scan-tree.test.ts",
  ".dev.vars",
]);

export function scanTree(root) {
  const hits = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const path = relative(root, full);
      if (skipFiles.has(path)) continue;
      const bytes = readFileSync(full);
      if (bytes.includes(0)) continue;
      const lines = bytes.toString("utf8").split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        for (const pattern of patterns) {
          pattern.re.lastIndex = 0;
          if (pattern.re.test(lines[index])) hits.push(`${pattern.name} ${path}:${index + 1}`);
        }
      }
    }
  };
  if (statSync(root).isDirectory()) walk(root);
  return hits;
}

if (process.argv[1] && process.argv[1].endsWith("secret-scan.mjs")) {
  const root = process.argv[2] ?? process.cwd();
  const hits = scanTree(root);
  if (hits.length === 0) console.log("secret-scan: nenhum achado na árvore de trabalho");
  else {
    console.log(hits.join("\n"));
    process.exitCode = 1;
  }
}
