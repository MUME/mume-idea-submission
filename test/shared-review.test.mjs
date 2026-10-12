import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  emptyDraft,
  draftResult,
  validateDraft,
  feedbackFor,
  contentOf,
} from "../src/lib/sharedReview.ts";
import {
  getReview,
  editReview,
  agreeReview,
  agreements,
  withdrawAgreement,
  reservePublish,
  finishPublish,
} from "../src/lib/sharedReviewDb.ts";
import { updateIdeaAnswers, updateStatus } from "../src/lib/db.ts";
import {
  handleReviewInteraction,
  reviewPayload,
  reviewButton,
} from "../src/discord/review.ts";
const A = { id: "A", name: "Alice" },
  B = { id: "B", name: "Bob" },
  C = { id: "C", name: "Carol" };
const complete = () => ({
  ...emptyDraft(),
  scores: { usefulness: 4, feasibility: 3, interest: 4 },
  reasons: {
    usefulness: "Useful",
    feasibility: "Moderate work",
    interest: "Strong support",
  },
});
async function fixture() {
  // Run the production SQL against SQLite with the D1 prepare/bind/batch shape.
  const sqlite = new DatabaseSync(":memory:");
  const mf = { dispose: async () => sqlite.close() };
  const DB = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(r.changes) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) out.push(await statement.run());
        sqlite.exec("COMMIT");
        return out;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  for (const name of [
    "0001_init.sql",
    "0002_review_copy.sql",
    "0003_assessments.sql",
    "0004_shared_council_review.sql",
  ]) {
    // Execute schema statements separately; SQL comments can include semicolons.
    const sql = readFileSync("migrations/" + name, "utf8").replace(
      /--[^\n]*/g,
      "",
    );
    for (const statement of sql.split(";").filter((x) => x.trim()))
      await DB.prepare(statement).run();
  }
  const idea = {
    id: 1,
    title: 'Help "navigation" — MUME',
    answers: JSON.stringify({ proposal: "line\nnew line" }),
    schema_version: 1,
    status: "submitted",
    thread_id: "public",
    review_thread_id: "private",
  };
  await DB.prepare(
    "INSERT INTO ideas(id,guild_id,author_id,author_name,title,status,schema_version,answers,created_at,updated_at,thread_id,review_thread_id) VALUES(1,?,?,?,?,?,?,?,0,0,?,?)",
  )
    .bind(
      "guild",
      "author",
      "Author",
      idea.title,
      idea.status,
      1,
      idea.answers,
      "public",
      "private",
    )
    .run();
  return {
    mf,
    env: { DB, DISCORD_GUILD_ID: "guild", COUNCIL_ROLE_ID: "council" },
    idea,
  };
}
test("new rubric: defaults, all 125 totals, flag precedence and input bounds", () => {
  assert.equal(draftResult(emptyDraft()).ready, false);
  for (let u = 1; u <= 5; u++)
    for (let f = 1; f <= 5; f++)
      for (let i = 1; i <= 5; i++) {
        const d = complete();
        d.scores = { usefulness: u, feasibility: f, interest: i };
        validateDraft(d);
        const r = draftResult(d);
        assert.equal(r.total, u + 2 * f + i);
        assert.ok(r.band);
      }
  const d = emptyDraft();
  d.issues = ["clarity"];
  d.issueReason = "Clarify";
  validateDraft(d);
  assert.equal(draftResult(d).ready, true);
  assert.equal(draftResult(d).band, null);
  assert.throws(() => validateDraft({ ...complete(), issues: ["unknown"] }));
  assert.throws(() =>
    validateDraft({ ...complete(), scores: { usefulness: 0 } }),
  );
  assert.match(feedbackFor({ id: 1, title: "Help" }, complete()), /14\/20/);
});
test("D1: three distinct whole-review agreements, revisions, audit, stale ideas, publication", async () => {
  const { mf, env, idea } = await fixture();
  try {
    let r = await getReview(env, idea);
    assert.deepEqual(JSON.parse(r.draft).issues, []);
    await assert.rejects(agreeReview(env, r, A));
    await editReview(env, r, idea, complete(), A, "Initial assessment");
    const stale = r;
    r = await getReview(env, idea);
    await assert.rejects(
      editReview(env, stale, idea, complete(), B, "Stale change"),
    );
    assert.equal(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) n FROM council_review_events",
        ).first()
      ).n,
      1,
    );
    await agreeReview(env, r, A);
    await assert.rejects(agreeReview(env, r, A));
    await agreeReview(env, r, B);
    assert.equal((await agreements(env, r)).length, 2);
    await assert.rejects(reservePublish(env, r));
    await agreeReview(env, r, C);
    await withdrawAgreement(env, r, C);
    await assert.rejects(reservePublish(env, r));
    await agreeReview(env, r, C);
    const revised = complete();
    revised.note = "Final feedback changed";
    await editReview(env, r, idea, revised, B, "Updated feedback");
    r = await getReview(env, idea);
    assert.equal((await agreements(env, r)).length, 0);
    assert.match(
      (
        await env.DB.prepare(
          "SELECT snapshot FROM council_review_events WHERE action='revise' ORDER BY id DESC LIMIT 1",
        ).first()
      ).snapshot,
      /Final feedback changed/,
    );
    await agreeReview(env, r, A);
    await agreeReview(env, r, B);
    await agreeReview(env, r, C);
    await updateIdeaAnswers(
      env,
      1,
      "Changed idea",
      { proposal: "different" },
      1,
      1,
    );
    await assert.rejects(reservePublish(env, r));
    await assert.rejects(agreeReview(env, r, { id: "D", name: "Dan" }));
    const changed = {
      ...idea,
      title: "Changed idea",
      answers: JSON.stringify({ proposal: "different" }),
    };
    await editReview(env, r, changed, revised, A, "Reassessed changed idea");
    r = await getReview(env, changed);
    await agreeReview(env, r, A);
    await agreeReview(env, r, B);
    await agreeReview(env, r, C);
    await reservePublish(env, r);
    await assert.rejects(
      editReview(env, r, changed, complete(), A, "During publication"),
    );
    await assert.rejects(withdrawAgreement(env, r, A));
    await assert.rejects(
      updateIdeaAnswers(env, 1, "Another", { proposal: "x" }, 1, 2),
    );
    await assert.rejects(updateStatus(env, 1, "resolved", 2));
    await finishPublish(env, r, "message123", A);
    r = await getReview(env, changed);
    assert.equal(r.status, "published");
    assert.equal(r.record_message_id, "message123");
    await assert.rejects(editReview(env, r, changed, complete(), A, "Closed"));
    await assert.rejects(reservePublish(env, r));
  } finally {
    await mf.dispose();
  }
});
test("D1: overlapping stale revisions accept one winner, preserve distinct revisions and history", async () => {
  const { mf, env, idea } = await fixture();
  try {
    const r = await getReview(env, idea);
    const results = [];
    for (const actor of [A, B]) {
      try {
        await editReview(env, r, idea, complete(), actor, actor.name + " edit");
        results.push({ status: "fulfilled" });
      } catch {
        results.push({ status: "rejected" });
      }
    }
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    const current = await getReview(env, idea);
    assert.equal(current.revision, 2);
    assert.equal(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) n FROM council_review_events",
        ).first()
      ).n,
      1,
    );
  } finally {
    await mf.dispose();
  }
});
test("native controls: role/guild guard, early deferred ACK, component limits, unknown values", async () => {
  const base = {
    type: 3,
    guild_id: "guild",
    channel_id: "private",
    application_id: "app",
    token: "token",
    member: { roles: [], user: { id: "A", username: "Alice" } },
    data: { custom_id: "review:open:1:0" },
  };
  const env = { DISCORD_GUILD_ID: "guild", COUNCIL_ROLE_ID: "council" };
  const denied = await handleReviewInteraction(
    env,
    {
      waitUntil() {
        throw Error("Must not queue unauthorized work");
      },
    },
    base,
  );
  assert.match((await denied.json()).data.content, /Only White Council/);
  const { mf, env: dbEnv, idea } = await fixture();
  try {
    let r = await getReview(dbEnv, idea);
    await editReview(dbEnv, r, idea, complete(), A, "Initial");
    r = await getReview(dbEnv, idea);
    const p = await reviewPayload(dbEnv, idea, r);
    assert.ok(p.components.length <= 5);
    assert.equal(p.components[0].components[0].min_values, 0);
    assert.equal(p.components[0].components[0].max_values, 6);
    assert.equal(reviewButton(1).components[0].custom_id, "review:open:1:0");
    let pending;
    const ack = await handleReviewInteraction(
      dbEnv,
      {
        waitUntil(p) {
          pending = p;
        },
      },
      { ...base, member: { ...base.member, roles: ["council"] } },
    );
    assert.equal((await ack.json()).type, 5);
    // Stub Discord network only for the queued response, retaining real D1.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("{}");
    try {
      await pending;
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await mf.dispose();
  }
});
test("native recording: private Council summary, frozen result, retry without duplicate posting", async () => {
  const { mf, env, idea } = await fixture();
  const originalFetch = globalThis.fetch;
  try {
    let r = await getReview(env, idea);
    await editReview(env, r, idea, complete(), A, "Initial assessment");
    r = await getReview(env, idea);
    await agreeReview(env, r, A);
    await agreeReview(env, r, B);
    await agreeReview(env, r, C);
    let posts = 0,
      posted,
      shown;
    globalThis.fetch = async (url, init) => {
      assert.ok(
        !url.includes("/channels/public/"),
        "Assessment recording must never access the public board",
      );
      if (url.endsWith("/users/@me")) return Response.json({ id: "bot" });
      if (url.includes("/channels/private/messages?")) return Response.json([]);
      if (
        url.endsWith("/channels/private/messages") &&
        init.method === "POST"
      ) {
        posts++;
        posted = JSON.parse(init.body);
        return Response.json({ id: "published-message" });
      }
      if (url.includes("/webhooks/")) {
        shown = JSON.parse(init.body);
        return Response.json({});
      }
      throw Error("Unexpected Discord request " + url);
    };
    const interaction = {
      type: 3,
      guild_id: "guild",
      channel_id: "private",
      application_id: "app",
      token: "token",
      member: { roles: ["council"], user: { id: A.id, username: A.name } },
      data: { custom_id: `review:publish:1:${r.revision}` },
    };
    let pending;
    await handleReviewInteraction(
      env,
      {
        waitUntil(p) {
          pending = p;
        },
      },
      interaction,
    );
    await pending;
    assert.equal(posts, 1);
    assert.match(posted.embeds[0].description, /Recommended · 14\/20/);
    assert.deepEqual(posted.allowed_mentions, { parse: [] });
    assert.equal(posted.enforce_nonce, true);
    assert.ok(posted.nonce.length <= 25);
    r = await getReview(env, idea);
    assert.equal(r.status, "published");
    assert.match(
      shown.embeds[0].description,
      /Closed — recorded in the private Council thread/,
    );
    // Retrying an already completed operation must not emit a second internal message.
    await handleReviewInteraction(
      env,
      {
        waitUntil(p) {
          pending = p;
        },
      },
      interaction,
    );
    await pending;
    assert.equal(posts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});
test("native publication recovery reuses a previously delivered bot message", async () => {
  const { mf, env, idea } = await fixture();
  const originalFetch = globalThis.fetch;
  try {
    let r = await getReview(env, idea);
    await editReview(env, r, idea, complete(), A, "Initial");
    r = await getReview(env, idea);
    await agreeReview(env, r, A);
    await agreeReview(env, r, B);
    await agreeReview(env, r, C);
    await reservePublish(env, r);
    let posts = 0;
    globalThis.fetch = async (url, init) => {
      assert.ok(
        !url.includes("/channels/public/"),
        "Assessment recording must never access the public board",
      );
      if (url.endsWith("/users/@me")) return Response.json({ id: "bot" });
      if (url.includes("/channels/private/messages?"))
        return Response.json([
          {
            id: "already-delivered",
            author: { id: "bot" },
            content: `**Internal Council assessment #1 · revision ${r.revision}**`,
          },
        ]);
      if (
        url.endsWith("/channels/private/messages") &&
        init.method === "POST"
      ) {
        posts++;
        return Response.json({ id: "duplicate" });
      }
      if (url.includes("/webhooks/")) return Response.json({});
      throw Error("Unexpected request");
    };
    let pending;
    await handleReviewInteraction(
      env,
      {
        waitUntil(p) {
          pending = p;
        },
      },
      {
        type: 3,
        guild_id: "guild",
        channel_id: "private",
        application_id: "app",
        token: "token",
        member: { roles: ["council"], user: { id: A.id, username: A.name } },
        data: { custom_id: `review:publish:1:${r.revision}` },
      },
    );
    await pending;
    assert.equal(posts, 0);
    r = await getReview(env, idea);
    assert.equal(r.record_message_id, "already-delivered");
    assert.equal(r.status, "published");
  } finally {
    globalThis.fetch = originalFetch;
    await mf.dispose();
  }
});
