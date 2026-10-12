// Refresh only private review controls. Dry-run unless --apply is passed.
// Staging: MUME_ENV_FILE=.dev.vars.staging node scripts/backfill-native-review.mjs --staging --apply
import { spawnSync } from "node:child_process";
import { loadEnv } from "./lib-env.mjs";
const staging = process.argv.includes("--staging"),
  apply = process.argv.includes("--apply");
if (staging && process.env.MUME_ENV_FILE !== ".dev.vars.staging")
  throw Error("Set MUME_ENV_FILE=.dev.vars.staging for staging.");
const env = loadEnv();
const q = spawnSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    staging ? "mume_ideas_staging" : "mume_ideas",
    "--remote",
    "--json",
    ...(staging ? ["--env", "staging"] : []),
    "--command",
    "SELECT id,review_thread_id,review_message_id FROM ideas WHERE review_thread_id IS NOT NULL AND review_message_id IS NOT NULL ORDER BY id;",
  ],
  { encoding: "utf8" },
);
if (q.status !== 0) throw Error(q.stderr);
const rows = JSON.parse(q.stdout)[0].results;
if (apply && !env.DISCORD_BOT_TOKEN)
  throw Error("DISCORD_BOT_TOKEN is required.");
const { build } = await import("esbuild");
const bundled = await build({
  entryPoints: ["src/discord/embed.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  logLevel: "silent",
});
const { buildIdeaComponents } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
for (const row of rows) {
  console.log(
    `${apply ? "Updating" : "Would update"} private review controls for idea ${row.id}`,
  );
  if (!apply) continue;
  const components = [
    ...buildIdeaComponents(row.id),
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: "Assess idea",
          custom_id: `review:open:${row.id}:0`,
        },
      ],
    },
  ];
  let ok = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${row.review_thread_id}/messages/${row.review_message_id}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ components }),
      },
    );
    if (res.ok) {
      ok = true;
      break;
    }
    if (res.status === 429) {
      const d = await res.json();
      await new Promise((r) =>
        setTimeout(r, Math.min(5000, (d.retry_after ?? 1) * 1000 + 100)),
      );
      continue;
    }
    throw Error(`Discord returned ${res.status} for idea ${row.id}`);
  }
  if (!ok) throw Error(`Rate limit retries exhausted for idea ${row.id}`);
}
