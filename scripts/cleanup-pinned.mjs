// One-off: delete every "Submit an idea" forum post the bot can see, so we can
// recreate a single clean (unlocked) one. Uses the bot token.

import { loadEnv, require as requireEnv } from "./lib-env.mjs";

const env = loadEnv();
requireEnv(env, ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "FORUM_CHANNEL_ID"]);

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` };

const res = await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/threads/active`, { headers: auth });
if (!res.ok) {
  console.error(`list active threads failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}
const { threads } = await res.json();
const targets = threads.filter(
  (t) => t.parent_id === env.FORUM_CHANNEL_ID && t.name === "Submit an idea",
);

console.log(`found ${targets.length} "Submit an idea" post(s) to delete`);
for (const t of targets) {
  const del = await fetch(`${API}/channels/${t.id}`, { method: "DELETE", headers: auth });
  console.log(`  ${del.ok ? "✓ deleted" : `✗ ${del.status}`} ${t.id}`);
}
console.log("done");
