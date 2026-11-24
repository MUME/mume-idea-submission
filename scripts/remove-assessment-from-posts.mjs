// Take the old "Assess idea" button and assessment summary off every private
// review post, leaving the idea card and its normal controls. Dry run unless
// --apply is passed. Archived threads are unarchived, patched and re-archived.
//   node scripts/remove-assessment-from-posts.mjs          (dry run)
//   node scripts/remove-assessment-from-posts.mjs --apply
import { spawnSync } from "node:child_process";
import { loadEnv, require as need } from "./lib-env.mjs";

const apply = process.argv.includes("--apply");
const env = loadEnv();
need(env, ["DISCORD_BOT_TOKEN"]);
const KV_ID = "dbabc2f4fe4f483faf939242d1f404a2";
const API = "https://discord.com/api/v10";
const UA = "DiscordBot (https://mume.org, 1.0)";

function wrangler(args) {
  const r = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw Error(r.stderr);
  return r.stdout;
}

const rows = JSON.parse(
  wrangler([
    "d1", "execute", "mume_ideas", "--remote", "--json", "--command",
    "SELECT * FROM ideas WHERE review_thread_id IS NOT NULL AND review_message_id IS NOT NULL ORDER BY id;",
  ]),
)[0].results;

const configs = new Map();
function configFor(v) {
  if (!configs.has(v)) {
    let raw;
    try {
      raw = wrangler(["kv", "key", "get", `form:config:v${v}`, "--namespace-id", KV_ID, "--remote"]);
    } catch {
      raw = wrangler(["kv", "key", "get", "form:config", "--namespace-id", KV_ID, "--remote"]);
    }
    configs.set(v, JSON.parse(raw));
  }
  return configs.get(v);
}

const { build } = await import("esbuild");
const bundled = await build({
  entryPoints: ["src/discord/embed.ts"],
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
});
const { buildEmbed, buildIdeaComponents } = await import(
  "data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64")
);

async function discord(method, path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json", "User-Agent": UA },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const d = await res.json();
      await new Promise((r) => setTimeout(r, Math.min(5000, (d.retry_after ?? 1) * 1000 + 150)));
      continue;
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }
  throw Error(`rate limit retries exhausted for ${path}`);
}

const hasAssess = (msg) =>
  (msg.components ?? []).some((row) => (row.components ?? []).some((c) => String(c.custom_id ?? "").startsWith("review:") || c.label === "Assess idea"));

let changed = 0, clean = 0, rearchived = 0, failed = 0;
for (const idea of rows) {
  const path = `/channels/${idea.review_thread_id}/messages/${idea.review_message_id}`;
  const got = await discord("GET", path);
  if (!got.ok) { console.log(`idea ${idea.id}: could not read post (${got.status})`); failed++; continue; }
  const dirty = hasAssess(got.data) || (got.data.embeds ?? []).length > 1;
  if (!dirty) { clean++; continue; }
  console.log(`${apply ? "Cleaning" : "Would clean"} idea ${idea.id} (buttons ${hasAssess(got.data) ? "yes" : "no"}, embeds ${(got.data.embeds ?? []).length})`);
  if (!apply) { changed++; continue; }
  const body = { embeds: [buildEmbed(idea, configFor(idea.schema_version))], components: buildIdeaComponents(idea.id) };
  let res = await discord("PATCH", path, body);
  if (!res.ok && res.data?.code === 50083) {
    await discord("PATCH", `/channels/${idea.review_thread_id}`, { archived: false });
    res = await discord("PATCH", path, body);
    await discord("PATCH", `/channels/${idea.review_thread_id}`, { archived: true });
    rearchived++;
  }
  if (res.ok) changed++;
  else { failed++; console.log(`idea ${idea.id}: failed ${res.status} ${JSON.stringify(res.data)}`); }
}
console.log(`${apply ? "cleaned" : "to clean"}=${changed} already-clean=${clean} rearchived=${rearchived} failed=${failed} total=${rows.length}`);
