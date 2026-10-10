// Tiny .dev.vars / env loader shared by the ops scripts. Values in the real
// environment win over .dev.vars.

import { readFileSync } from "node:fs";

export function loadEnv() {
  const env = {};
  // MUME_ENV_FILE lets the ops scripts target staging: `.dev.vars.staging`.
  const file = process.env.MUME_ENV_FILE || ".dev.vars";
  try {
    const raw = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // no .dev.vars — rely on process.env
  }
  return { ...env, ...process.env };
}

export function require(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing required values: ${missing.join(", ")}`);
    console.error("Set them in .dev.vars or the environment.");
    process.exit(1);
  }
}
