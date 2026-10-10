// Push every secret from an env file to a Worker environment in one go.
//
//   node scripts/set-secrets.mjs                                  # live instance, from .dev.vars
//   MUME_ENV_FILE=.dev.vars.staging node scripts/set-secrets.mjs --env staging
//
// PUBLIC_BASE_URL is a var (set in wrangler.toml), not a secret, so it's skipped.

import { spawnSync } from "node:child_process";
import { loadEnv } from "./lib-env.mjs";

const SECRETS = [
  "DISCORD_APP_ID",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "FORUM_CHANNEL_ID",
  "SUBMIT_CHANNEL_ID",
  "EXPORT_CHANNEL_ID",
  "SUBMITTED_CHANNEL_ID",
  "COUNCIL_ROLE_ID",
  "SESSION_SIGNING_KEY",
  "ADMIN_TOKEN",
];

const envFlagIndex = process.argv.indexOf("--env");
const wranglerEnv = envFlagIndex !== -1 ? process.argv[envFlagIndex + 1] : null;

const env = loadEnv();
console.log(`Setting ${SECRETS.length} secrets${wranglerEnv ? ` for --env ${wranglerEnv}` : " (live)"}…`);

for (const name of SECRETS) {
  const value = env[name];
  if (!value) {
    console.warn(`  · skipped ${name} (empty in env file)`);
    continue;
  }
  const args = ["wrangler", "secret", "put", name];
  if (wranglerEnv) args.push("--env", wranglerEnv);
  const res = spawnSync("npx", args, { input: value, encoding: "utf8", stdio: ["pipe", "ignore", "inherit"] });
  console.log(`  ${res.status === 0 ? "✓" : "✗"} ${name}`);
}
console.log("Done.");
