// Create (or find) a locked "button-only" text channel: @everyone can view but
// not post, react, or start threads — they can only click the Submit button.
// The bot keeps permission to post + pin the button message. Prints the channel id.

import { loadEnv, require as requireEnv } from "./lib-env.mjs";

const env = loadEnv();
requireEnv(env, ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "DISCORD_APP_ID"]);

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };
const NAME = "submit-an-idea";

// Permission bits.
const VIEW = 1n << 10n;
const SEND = 1n << 11n;
const ADD_REACTIONS = 1n << 6n;
const EMBED_LINKS = 1n << 14n;
const MANAGE_MESSAGES = 1n << 13n;
const CREATE_PUBLIC_THREADS = 1n << 35n;
const SEND_IN_THREADS = 1n << 38n;

const botAllow = (VIEW | SEND | EMBED_LINKS | MANAGE_MESSAGES).toString();
const fullDeny = (SEND | ADD_REACTIONS | CREATE_PUBLIC_THREADS | SEND_IN_THREADS).toString();
const minDeny = SEND.toString();

// Idempotent: reuse an existing channel of this name if present.
const listRes = await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/channels`, { headers: auth });
if (!listRes.ok) {
  console.error(`list channels failed: ${listRes.status}\n${await listRes.text()}`);
  process.exit(1);
}
const channels = await listRes.json();
const existing = channels.find((c) => c.type === 0 && c.name === NAME);
const channelId = existing ? existing.id : await createPlainChannel();

// Lock down as separate best-effort steps (needs Manage Roles + holding the bits).
// Grant the bot the largest set it will accept, so it can still post the button.
const botTiers = [
  [botAllow, "view+send+embed+manage"],
  [(VIEW | SEND | EMBED_LINKS).toString(), "view+send+embed"],
  [(VIEW | SEND).toString(), "view+send"],
];
let botOk = false;
for (const [allow, label] of botTiers) {
  if (await putOverwrite(channelId, env.DISCORD_APP_ID, 1, allow, "0", `bot allow (${label})`)) {
    botOk = true;
    break;
  }
}
const denied =
  (await putOverwrite(channelId, env.DISCORD_GUILD_ID, 0, "0", fullDeny, "@everyone deny (full)")) ||
  (await putOverwrite(channelId, env.DISCORD_GUILD_ID, 0, "0", minDeny, "@everyone deny (send only)"));
if (!botOk) console.log("WARN: bot has no send-allow overwrite; it may not be able to post the button.");

console.log(`\nSUBMIT_CHANNEL_ID=${channelId}   (${existing ? "reused" : "created"} #${NAME})`);
if (!denied) {
  console.log("NOTE: couldn't lock the channel automatically. In Discord, open the channel's");
  console.log("permissions and deny @everyone 'Send Messages' so it's button-only.");
}

async function createPlainChannel() {
  const res = await fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: NAME,
      type: 0,
      topic: "Click the button to submit a MUME idea. This channel is button-only — no messages.",
    }),
  });
  if (!res.ok) {
    console.error(`create channel failed: ${res.status}\n${await res.text()}`);
    console.error(`\nCreate a text channel named "${NAME}" by hand and give me its ID.`);
    process.exit(1);
  }
  return (await res.json()).id;
}

async function putOverwrite(channelId, id, type, allow, deny, label) {
  const res = await fetch(`${API}/channels/${channelId}/permissions/${id}`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ type, allow, deny }),
  });
  console.log(`  ${res.ok ? "✓" : `✗ ${res.status}`} ${label}`);
  return res.ok;
}
