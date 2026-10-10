// One-off: bring existing idea posts up to date with two new features —
//   1. add the "Resolved" option to their status dropdown (messages bake in their
//      components at post time, so old posts need re-rendering), and
//   2. seed the 👎 reaction (older posts only had 👍).
// Re-renders the control-bearing copy (review copy if present, else the public
// post) and adds 👎 to the public post. Idempotent.
//
//   node scripts/backfill-resolved-option.mjs

import { spawnSync } from "node:child_process";
import { loadEnv } from "./lib-env.mjs";

const env = loadEnv();
const TOKEN = env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN missing from env file");
const API = "https://discord.com/api/v10";

// Mirror of STATUSES + STATUS_LABEL/STATUS_DESCRIPTION and buildIdeaComponents.
const OPTIONS = [
  { label: "In Proposal", value: "in_proposal", description: "Open for discussion and rewrites" },
  { label: "Final Draft", value: "final_draft", description: "Author considers it settled" },
  { label: "Submitted", value: "submitted", description: "In the review queue for debate" },
  { label: "Reviewed", value: "approved", description: "Reviewed — exported and locked" },
  { label: "Resolved", value: "resolved", description: "Closed — thread locked, no further changes" },
];
const components = (id) => [
  {
    type: 1,
    components: [
      { type: 3, custom_id: `idea:status:${id}`, placeholder: "Change status", disabled: false, options: OPTIONS.map((o) => ({ ...o, default: false })) },
    ],
  },
  { type: 1, components: [{ type: 2, style: 2, label: "Edit idea", custom_id: `idea:edit:${id}` }] },
];

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

// Pull the ideas straight from the remote D1.
const q = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "mume_ideas", "--remote", "--json", "--command",
    "SELECT id, thread_id, message_id, review_thread_id, review_message_id FROM ideas ORDER BY id;"],
  { encoding: "utf8" },
);
if (q.status !== 0) throw new Error(`d1 query failed:\n${q.stderr}`);
const rows = JSON.parse(q.stdout)[0].results;
console.log(`Backfilling ${rows.length} ideas…`);

for (const r of rows) {
  const hasReview = !!r.review_thread_id && !!r.review_message_id;
  const ctrlChannel = hasReview ? r.review_thread_id : r.thread_id;
  const ctrlMessage = hasReview ? r.review_message_id : r.message_id;

  // 1. Refresh the dropdown on the control-bearing copy.
  if (ctrlChannel && ctrlMessage) {
    const res = await discord(`/channels/${ctrlChannel}/messages/${ctrlMessage}`, {
      method: "PATCH",
      body: JSON.stringify({ components: components(r.id) }),
    });
    console.log(`  idea ${r.id}: dropdown ${res.ok ? "✓" : `✗ ${res.status} ${await res.text().catch(() => "")}`} (${hasReview ? "review" : "public"})`);
  }

  // 2. Seed 👎 on the public post (👍 is already there).
  if (r.thread_id && r.message_id) {
    const emoji = encodeURIComponent("👎");
    const res = await discord(`/channels/${r.thread_id}/messages/${r.message_id}/reactions/${emoji}/@me`, { method: "PUT" });
    console.log(`  idea ${r.id}: 👎 ${res.ok ? "✓" : `✗ ${res.status}`}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
console.log("Done.");
