import { existsSync, readdirSync, rmSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const allowedBuildSecrets = new Set(["TURNSTILE_SECRET", "AUDIT_HASH_SALT"]);

function stripEmittedDevVars(): Plugin {
  return {
    name: "strip-emitted-dev-vars",
    apply: "build",
    closeBundle() {
      const root = "dist";
      if (!existsSync(root)) return;
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) {
            walk(path);
            continue;
          }
          if (name !== ".dev.vars") continue;
          const keys = readFileSync(path, "utf8")
            .split("\n")
            .map((line) => line.split("=")[0]?.trim())
            .filter((key) => key && !key.startsWith("#"));
          for (const key of keys) {
            if (!allowedBuildSecrets.has(key)) {
              throw new Error(`build emitiu variável não declarada: ${key}`);
            }
          }
          rmSync(path);
        }
      };
      walk(root);
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflare(), stripEmittedDevVars()],
});
