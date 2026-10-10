// Create (or find) a plain text channel for approved-idea CSV exports.
// Prints the channel id.

import { loadEnv, require as requireEnv } from "./lib-env.mjs";

const env = loadEnv();
requireEnv(env, ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"]);

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
const NAME = "approved-ideas";

const listRes = await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/channels`, { headers: auth });
if (!listRes.ok) {
  console.error(`list channels failed: ${listRes.status}\n${await listRes.text()}`);
  process.exit(1);
}
const existing = (await listRes.json()).find((c) => c.type === 0 && c.name === NAME);
if (existing) {
  console.log(`EXPORT_CHANNEL_ID=${existing.id}   (reused #${NAME})`);
  process.exit(0);
}

const res = await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ name: NAME, type: 0, topic: "Approved ideas are posted here as CSV exports." }),
});
if (!res.ok) {
  console.error(`create channel failed: ${res.status}\n${await res.text()}`);
  process.exit(1);
}
console.log(`EXPORT_CHANNEL_ID=${(await res.json()).id}   (created #${NAME})`);
