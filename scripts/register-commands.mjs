// Register the app's commands (build spec §7). Run once, and again whenever the
// command definitions change.
//
//   npm run register
//
// - Guild commands (instant): /idea, /idea-setup
// - Global Primary Entry Point command (needed to launch Activities): "submit-an-idea"

import { loadEnv, require as requireEnv } from "./lib-env.mjs";

const env = loadEnv();
requireEnv(env, ["DISCORD_APP_ID", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"]);

const API = "https://discord.com/api/v10";
const auth = { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" };

// Guild commands — appear immediately in the test server.
const guildCommands = [
  {
    name: "idea",
    type: 1,
    description: "Open the MUME idea submission form",
  },
  {
    name: "idea-setup",
    type: 1,
    description: "Create or repair the pinned submission post (White Council only)",
  },
  {
    name: "idea-delete",
    type: 1,
    description: "Delete an idea and its forum post (White Council only)",
    options: [
      { name: "number", description: "The idea number (e.g. 247)", type: 4, required: true },
    ],
  },
  {
    name: "idea-edit",
    type: 1,
    description: "Reopen an idea to refine it (author or White Council)",
    options: [
      { name: "number", description: "The idea number (e.g. 247)", type: 4, required: true },
    ],
  },
];

// Global Primary Entry Point command. handler = 2 (DISCORD_LAUNCH_ACTIVITY) so
// Discord opens the Activity without hitting our endpoint. Enables LAUNCH_ACTIVITY.
const entryPointCommand = {
  name: "submit-an-idea",
  description: "Open the MUME idea submission form",
  type: 4, // PRIMARY_ENTRY_POINT
  handler: 2, // DISCORD_LAUNCH_ACTIVITY
  integration_types: [0], // GUILD_INSTALL
  contexts: [0, 1, 2],
};

async function put(url, body, label) {
  const res = await fetch(url, { method: "PUT", headers: auth, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${label}: ${res.status}\n${text}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

// Global commands must include the entry point plus any other globals. We keep
// only the entry point global and register /idea, /idea-setup per-guild.
await put(
  `${API}/applications/${env.DISCORD_APP_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`,
  guildCommands,
  "guild commands (/idea, /idea-setup)",
);
await put(`${API}/applications/${env.DISCORD_APP_ID}/commands`, [entryPointCommand], "global entry point command");

console.log("\nDone. /idea and /idea-setup are live in the test server now.");
console.log("The entry point command may take a few minutes to appear.");
