// Manual recovery; default is read-only. Use one repair process, with Council
// submissions paused, to exclude concurrent live deliveries while --apply runs.
import { spawnSync } from "node:child_process";
import { loadEnv, require as requireEnv } from "./lib-env.mjs";
import { findReviewCopies, repairReviewCopy } from "./lib-review-repair.mjs";
const args = process.argv.slice(2);
let config, only, apply = false, paused = false;
for (let n = 0; n < args.length; n++) {
  if (args[n] === "--config") config = args[++n];
  else if (args[n] === "--idea") { only = args[++n]; if (!only || only.startsWith("--")) throw Error("Missing --idea id"); }
  else if (args[n] === "--apply") apply = true;
  else if (args[n] === "--submissions-paused") paused = true;
  else throw Error("Unknown argument: " + args[n]);
}
if (!config || config.startsWith("--")) throw Error("Specify --config path/to/wrangler.toml explicitly");
if (only !== undefined && !/^[1-9][0-9]*$/.test(only)) throw Error("Invalid --idea id");
if (apply && !paused) throw Error("Pause new Submitted transitions and other repair runs, then add --submissions-paused");
const env = loadEnv();
function execute(sql) {
  const result = spawnSync("npx", ["wrangler", "d1", "execute", "DB", "--remote", "--json",
    "--config", config, "--command", sql], { encoding: "utf8" });
  if (result.status !== 0) throw Error(result.stderr || "D1 command failed");
  const data = JSON.parse(result.stdout);
  if (!Array.isArray(data) || data.some((r) => r.success === false)) throw Error("D1 query failed");
  return data[0];
}
const missing = execute("SELECT * FROM ideas WHERE status='submitted' AND " +
  "(review_thread_id IS NULL OR review_message_id IS NULL)" +
  (only ? " AND id=" + only : "") + " ORDER BY id").results;
for (const idea of missing) console.log("Missing private copy: idea #" + idea.id);
if (!apply) {
  console.log("Dry run: " + missing.length + " missing copy/copies. No Discord messages or database records changed.");
} else {
  requireEnv(env, ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "SUBMITTED_CHANNEL_ID"]);
  const request = async (route, options = {}) => {
    const response = await fetch("https://discord.com/api/v10" + route, {
      method: options.method || "GET",
      headers: { Authorization: "Bot " + env.DISCORD_BOT_TOKEN, "Content-Type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok) throw Error("Discord request failed (" + response.status + "); stopped without a blind retry");
    return response.json();
  };
  const bot = await request("/users/@me");
  const { build } = await import("esbuild");
  const bundle = await build({
    stdin: { contents: 'export { buildIdeaComponents } from "./src/discord/embed.ts"; export { reviewButton } from "./src/discord/review.ts";', resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
  });
  const { buildIdeaComponents, reviewButton } = await import(
    "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";
  for (const old of missing) {
    const idea = execute("SELECT * FROM ideas WHERE id=" + old.id).results[0];
    if (!idea || idea.status !== "submitted") continue;
    if (idea.review_thread_id && idea.review_message_id) continue;
    if (idea.guild_id !== env.DISCORD_GUILD_ID) throw Error("Configured guild does not match idea #" + idea.id);
    const result = await repairReviewCopy({
      find: () => findReviewCopies(request, env.DISCORD_GUILD_ID, env.SUBMITTED_CHANNEL_ID, idea.id, bot.id),
      create: async () => {
        // A partial attachment must be investigated, not replaced automatically.
        if (idea.review_thread_id || idea.review_message_id) throw Error("Partial attachment for idea #" + idea.id + "; inspect it manually");
        if (!idea.thread_id || !idea.message_id) throw Error("No public source for idea #" + idea.id);
        const source = await request("/channels/" + idea.thread_id + "/messages/" + idea.message_id);
        if (source.author?.id !== bot.id ||
          !source.embeds?.some((e) => e.footer?.text?.startsWith("Idea " + idea.id + " ·")))
          throw Error("Public source could not be verified for idea #" + idea.id);
        // Copy the already-rendered public idea, without reading assessment tables
        // or loading a potentially different form version.
        const embeds = source.embeds.map((e) => ({
          ...(e.title ? { title: e.title } : {}),
          ...(e.description ? { description: e.description } : {}),
          ...(e.color !== undefined ? { color: e.color } : {}),
          ...(e.fields ? { fields: e.fields } : {}),
          ...(e.footer ? { footer: { text: e.footer.text } } : {}),
          ...(e.author ? { author: { name: e.author.name } } : {}),
        }));
        const post = await request("/channels/" + env.SUBMITTED_CHANNEL_ID + "/threads", {
          method: "POST", body: { name: ("Idea " + idea.id + " · " + idea.title).slice(0, 100),
            auto_archive_duration: 10080,
            message: { embeds, components: [...buildIdeaComponents(idea.id), reviewButton(idea.id)],
              allowed_mentions: { parse: [] } } },
        });
        return { threadId: post.id, messageId: post.message?.id || post.id };
      },
      attach: async ({ threadId, messageId }) => {
        if (!/^\d+$/.test(threadId) || !/^\d+$/.test(messageId)) throw Error("Invalid Discord identifiers");
        execute("UPDATE ideas SET review_thread_id=" + quote(threadId) + ",review_message_id=" + quote(messageId) +
          ",updated_at=" + Math.floor(Date.now() / 1000) + " WHERE id=" + idea.id +
          " AND status='submitted' AND (review_thread_id IS NULL OR review_thread_id=" + quote(threadId) + ")" +
          " AND (review_message_id IS NULL OR review_message_id=" + quote(messageId) + ")");
        const saved = execute("SELECT review_thread_id,review_message_id FROM ideas WHERE id=" + idea.id).results[0];
        if (saved?.review_thread_id !== threadId || saved?.review_message_id !== messageId)
          throw Error("Idea changed during repair; post was preserved. Inspect before retrying.");
      },
    });
    console.log((result.reused ? "Reattached" : "Created and attached") + " private copy for idea #" + idea.id);
  }
}
