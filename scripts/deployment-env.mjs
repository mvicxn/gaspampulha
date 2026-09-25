export const TEST_SITEKEY = "1x00000000000000000000AA";
export const TEST_TURNSTILE_SECRETS = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
];
export const PRODUCTION_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const TARGETS = new Set(["local", "preview", "production"]);

export function assertRemoteVersionUrlsOff(state) {
  if (!state || state.previews_enabled !== false) throw new Error("remote-version-urls");
}

export function assertPreviewUrlsOff(config) {
  const match = config.match(/"preview_urls"\s*:\s*(true|false)/);
  if (!match || match[1] !== "false") throw new Error("preview-urls-enabled");
}

export function getDeploymentEnvironment(target) {
  if (!TARGETS.has(target)) throw new Error("ambiente ambíguo");
  return target;
}

function isTestSecret(value) {
  return TEST_TURNSTILE_SECRETS.includes(value);
}

export function assertDeployment(spec) {
  const environment = getDeploymentEnvironment(spec.target);
  const errors = [];
  if (spec.databaseId && spec.previewDatabaseId && spec.databaseId === spec.previewDatabaseId && environment === "production") {
    errors.push("production-uses-preview-db");
  }
  if (spec.databaseId && spec.productionDatabaseId && spec.databaseId === spec.productionDatabaseId && environment === "preview") {
    if (spec.productionDatabaseId !== PRODUCTION_PLACEHOLDER) errors.push("preview-uses-production-db");
  }
  if (environment === "production") {
    if (spec.databaseId === PRODUCTION_PLACEHOLDER) errors.push("production-placeholder");
    if (spec.databaseName !== "gaspampulha-production") errors.push("production-name");
    if (spec.siteKey === TEST_SITEKEY) errors.push("production-test-turnstile");
    if (!spec.turnstileSecret) errors.push("missing-production-secret");
    if (isTestSecret(spec.turnstileSecret)) errors.push("production-test-turnstile");
    if (!spec.auditSalt) errors.push("missing-production-secret");
    if (spec.auditSalt && (spec.auditSalt === spec.localSalt || spec.auditSalt === spec.previewSalt)) {
      errors.push("reused-salt");
    }
  }
  if (environment === "preview") {
    if (spec.databaseName !== "gaspampulha-preview") errors.push("preview-name");
    if (spec.siteKey !== TEST_SITEKEY) errors.push("preview-sitekey");
    if (spec.turnstileSecret && !isTestSecret(spec.turnstileSecret)) errors.push("preview-uses-production-secret");
  }
  if (environment === "local") {
    if (spec.databaseName === "gaspampulha-production" || spec.databaseName === "gaspampulha-preview") {
      errors.push("local-remote-db");
    }
  }
  if (errors.length > 0) throw new Error(errors.join(","));
  return environment;
}
