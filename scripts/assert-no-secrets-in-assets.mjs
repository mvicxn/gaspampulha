import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const forbiddenNames = new Set([
  ".dev.vars",
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials",
  "credentials.json",
  "secrets.json",
]);

const contentPatterns = [
  { type: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { type: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { type: "cloudflare-test-secret", re: /1x0000000000000000000000000000000AA/ },
  { type: "assigned-secret", re: /(TURNSTILE_SECRET|AUDIT_HASH_SALT|ADMIN_PASSWORD)\s*[:=]\s*['"`]?[^'"\s`]{8,}/ },
];

export function scanAssets(root) {
  const hits = [];
  let exists = true;
  try {
    statSync(root);
  } catch {
    exists = false;
  }
  if (!exists) return hits;
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
        continue;
      }
      if (forbiddenNames.has(name) || name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key")) {
        hits.push({ file: path, type: "forbidden-file" });
        continue;
      }
      if (stat.size > 2_000_000) continue;
      if (!/\.(js|mjs|cjs|html|css|json|txt|map)$/.test(name) && basename(path).includes(".")) continue;
      let text = "";
      try {
        text = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      for (const pattern of contentPatterns) {
        if (pattern.re.test(text)) hits.push({ file: path, type: pattern.type });
      }
    }
  }
  walk(root);
  return hits;
}

const isMain = process.argv[1] && process.argv[1].endsWith("assert-no-secrets-in-assets.mjs");
if (isMain) {
  const root = process.argv[2] ?? "dist";
  const hits = scanAssets(root);
  if (hits.length === 0) {
    console.log(`verify:assets: nenhum segredo em ${root}`);
  } else {
    for (const hit of hits) console.error(`${hit.type} ${hit.file}`);
    process.exit(1);
  }
}
