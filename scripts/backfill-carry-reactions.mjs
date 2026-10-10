// One-off: backfill the "Reactions carried from the public post" first comment
// into the review copies of already-submitted ideas, matching the live feature
// added to createReviewPost. For each submitted idea (review_thread_id set) it
// reads the CURRENT reactions on the public post, subtracts the bot's own seeded
// 👍/👎 (reaction.me), and posts the one-line summary into the review thread.
//
// Idempotent: skips any review thread that already carries the line.
// Dry run (no posting): DRY_RUN=1 node scripts/backfill-carry-reactions.mjs
//        Post for real: node scripts/backfill-carry-reactions.mjs

import { spawnSync } from "node:child_process";
import { loadEnv } from "./lib-env.mjs";

const env = loadEnv();
const TOKEN = env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN missing from env file");
const API = "https://discord.com/api/v10";
const HEADER = "**Reactions carried from the public post**";
const DRY_RUN = !!env.DRY_RUN;

async function discord(path, init = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const wait = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
      console.warn(`  429 on ${path} — waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error(`gave up after retries: ${path}`);
}

// Match the Worker's formatReactionEmoji: unicode passes through, custom emoji
// become the <:name:id> tag Discord renders inline.
function formatEmoji(e) {
  if (e.id) return `<${e.animated ? "a" : ""}:${e.name || "emoji"}:${e.id}>`;
  return e.name || "❓";
}

const q = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "mume_ideas", "--remote", "--json", "--command",
    "SELECT id, thread_id, message_id, review_thread_id FROM ideas WHERE review_thread_id IS NOT NULL ORDER BY id;"],
  { encoding: "utf8" },
);
if (q.status !== 0) throw new Error(`d1 query failed:\n${q.stderr}`);
const rows = JSON.parse(q.stdout)[0].results;
console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Backfilling carried reactions for ${rows.length} submitted ideas…\n`);

for (const r of rows) {
  if (!r.thread_id || !r.message_id || !r.review_thread_id) continue;

  // Idempotency guard: skip if the review thread already has the carried line.
  const existing = await discord(`/channels/${r.review_thread_id}/messages?limit=50`);
  if (existing.ok) {
    const msgs = await existing.json().catch(() => []);
    if (Array.isArray(msgs) && msgs.some((m) => (m.content || "").includes(HEADER))) {
      console.log(`  idea ${r.id}: already backfilled — skipping`);
      continue;
    }
  }

  // Read the public post's current reactions.
  const res = await discord(`/channels/${r.thread_id}/messages/${r.message_id}`);
  if (!res.ok) { console.log(`  idea ${r.id}: fetch public post ✗ ${res.status}`); continue; }
  const msg = await res.json();
  const parts = [];
  for (const rx of msg.reactions ?? []) {
    const net = rx.count - (rx.me ? 1 : 0); // subtract the bot's own seeded +1
    if (net > 0) parts.push(`${formatEmoji(rx.emoji)} ${net}`);
  }
  const content = parts.length ? `${HEADER} — ${parts.join(" · ")}` : `${HEADER} — none yet.`;

  if (DRY_RUN) {
    console.log(`  idea ${r.id}: would post →  ${content.slice(HEADER.length + 3)}`);
    continue;
  }

  const post = await discord(`/channels/${r.review_thread_id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  console.log(`  idea ${r.id}: ${post.ok ? "✓" : `✗ ${post.status} ${await post.text().catch(() => "")}`}  ${content.slice(HEADER.length + 3)}`);
  await new Promise((res) => setTimeout(res, 400));
}
console.log("\nDone.");
