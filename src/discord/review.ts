// Native Discord assessment: personal ephemeral controls over a shared D1 draft.
import type { Env, IdeaRow } from "../types";
import { EPHEMERAL } from "../constants";
import { holdsCouncil } from "../lib/council";
import { getIdea } from "../lib/db";
import { CRITERIA, CHECKS } from "../lib/rubric";
import {
  contentOf,
  draftResult,
  feedbackFor,
  AGREEMENTS_REQUIRED,
} from "../lib/sharedReview";
import type { ReviewDraft, Reviewer } from "../lib/sharedReview";
import {
  getReview,
  agreements,
  editReview,
  agreeReview,
  withdrawAgreement,
  reservePublish,
  finishPublish,
} from "../lib/sharedReviewDb";
import type { SharedReview } from "../lib/sharedReviewDb";
import { discordFetch, discordJson } from "./rest";
export interface ReviewInteraction {
  type: number;
  guild_id?: string;
  channel_id?: string;
  token: string;
  application_id: string;
  member?: {
    roles: string[];
    user: { id: string; username: string; global_name?: string | null };
  };
  data?: {
    custom_id?: string;
    values?: string[];
    components?: Array<{
      components?: Array<{ custom_id: string; value: string }>;
    }>;
  };
}
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
const escape = (s: string) =>
  s.replace(/([\\*_`~|>])/g, "\\$1").replace(/@/g, "＠");
const button = (label: string, id: string, style = 2, disabled = false) => ({
  type: 2,
  label,
  custom_id: id,
  style,
  disabled,
});
export function reviewButton(ideaId: number): Record<string, unknown> {
  return {
    type: 1,
    components: [button("Assess idea", `review:open:${ideaId}:0`, 1)],
  };
}
const textInput = (
  id: string,
  label: string,
  value: string,
  max: number,
  required = true,
) => ({
  type: 1,
  components: [
    {
      type: 4,
      custom_id: id,
      label,
      style: 2,
      value,
      max_length: max,
      required,
    },
  ],
});
export async function reviewPayload(env: Env, idea: IdeaRow, r: SharedReview) {
  const draft: ReviewDraft = JSON.parse(r.draft),
    result = draftResult(draft);
  const stale = r.idea_content !== contentOf(idea),
    votes = stale ? [] : await agreements(env, r);
  const closed = r.status === "published",
    busy = r.status === "publishing";
  const cid = (op: string) => `review:${op}:${idea.id}:${r.revision}`;
  const fields = CRITERIA.map((c) => ({
    name: `${c.name}${c.weight === 2 ? " ×2" : ""}`,
    value:
      draft.scores[c.id] === null
        ? "Not assessed"
        : `**${draft.scores[c.id]}/5** · ${c.levels[draft.scores[c.id]! - 1]}\n${escape(draft.reasons[c.id] || "").slice(0, 650)}`,
    inline: false,
  }));
  fields.push({
    name: "Issues requiring action",
    value: result.flags.length
      ? result.flags.map((c) => `• ${c.name}`).join("\n") +
        "\n" +
        escape(draft.issueReason).slice(0, 1000)
      : "None selected — checks pass by default.",
    inline: false,
  });
  fields.push({
    name: "Whole-assessment agreement",
    value: stale
      ? "The idea changed. Revise this draft to assess the updated idea; old agreements no longer count."
      : `${votes.length}/${AGREEMENTS_REQUIRED} Council members${votes.length ? "\n" + votes.map((a) => escape(a.name)).join(", ") : ""}`,
    inline: false,
  });
  if (draft.note)
    fields.push({
      name: "Internal Council note",
      value: escape(draft.note).slice(0, 1000),
      inline: false,
    });
  const status = closed
    ? "Closed — recorded in the private Council thread"
    : busy
      ? "Publication in progress — retry if the previous attempt failed"
      : stale
        ? "Idea changed — reassessment required"
        : result.flags.length
          ? "Further action required"
          : result.band
            ? `${result.band.name} · ${result.total}/20`
            : "Scores incomplete";
  return {
    content: "",
    embeds: [
      {
        title: `Council assessment · Idea #${idea.id}`,
        description: `**${escape(idea.title)}**\n${status}\nRevision ${r.revision} · ${closed ? "Final" : "Draft"}\nEach agreement covers the scores, selected issues and final feedback together. Refresh to see other reviewers’ changes.`,
        color: result.flags.length ? 0xd39a31 : 0x5865f2,
        fields,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: cid("issues"),
            placeholder: "Issues requiring action (none = pass)",
            min_values: 0,
            max_values: 6,
            disabled: closed || busy,
            options: CHECKS.map((c) => ({
              label: c.name,
              value: c.id,
              default: draft.issues.includes(c.id),
            })),
          },
        ],
      },
      {
        type: 1,
        components: [
          button(
            closed ? "Reopen assessment" : "Adjust scores / feedback",
            cid(closed ? "reopen" : "edit"),
            2,
            busy,
          ),
          button("Refresh", cid("refresh")),
          button("Preview internal summary", cid("preview")),
        ],
      },
      {
        type: 1,
        components: [
          button(
            "Agree with assessment",
            cid("agree"),
            1,
            closed || busy || stale || !result.ready,
          ),
          button(
            "Withdraw my agreement",
            cid("withdraw"),
            2,
            closed || busy || stale,
          ),
          button(
            busy ? "Retry internal recording" : "Close and record internally",
            cid("publish"),
            1,
            closed ||
              stale ||
              !result.ready ||
              votes.length < AGREEMENTS_REQUIRED,
          ),
        ],
      },
    ],
    allowed_mentions: { parse: [] },
  };
}
function modal(id: string, title: string, components: unknown[]) {
  return response({ type: 9, data: { custom_id: id, title, components } });
}
function inputs(i: ReviewInteraction) {
  const out: Record<string, string> = {};
  for (const row of i.data?.components ?? [])
    for (const c of row.components ?? []) out[c.custom_id] = c.value;
  return out;
}
async function publish(
  env: Env,
  idea: IdeaRow,
  r: SharedReview,
  actor: Reviewer,
) {
  if (!idea.review_thread_id)
    throw Error(
      "The idea has no private Council thread to record the assessment.",
    );
  await reservePublish(env, r);
  // A stable nonce prevents duplicate messages during short-term retries. If a
  // retry is needed later, find the durable marker in message history first.
  const marker = `Internal Council assessment #${idea.id} · revision ${r.revision}`;
  let message: { id: string } | undefined;
  let before: string | undefined;
  const bot = await discordJson<{ id: string }>(env, "/users/@me");
  for (;;) {
    const rows = await discordJson<
      Array<{
        id: string;
        content?: string;
        author?: { id: string; bot?: boolean };
      }>
    >(
      env,
      `/channels/${idea.review_thread_id}/messages?limit=100${before ? "&before=" + before : ""}`,
    );
    // Match our bot author, not merely a user quoting the marker.
    message = rows.find(
      (m) => m.author?.id === bot.id && m.content?.startsWith(`**${marker}**`),
    );
    if (message || rows.length < 100) break;
    before = rows[rows.length - 1].id;
  }
  if (!message) {
    const text = feedbackFor(idea, JSON.parse(r.draft));
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(marker),
    );
    const nonce = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 24);
    // Use a file-free embed split into bounded chunks for long Council reasons.
    const chunks: string[] = [];
    for (let n = 0; n < text.length; n += 3500)
      chunks.push(text.slice(n, n + 3500));
    message = await discordJson<{ id: string }>(
      env,
      `/channels/${idea.review_thread_id}/messages`,
      {
        method: "POST",
        body: {
          content: `**${marker}**`,
          embeds: chunks.map((description) => ({
            description,
            color: 0x5865f2,
          })),
          allowed_mentions: { parse: [] },
          nonce,
          enforce_nonce: true,
        },
      },
    );
  }
  await finishPublish(env, r, message.id, actor);
}
export async function handleReviewInteraction(
  env: Env,
  ctx: ExecutionContext,
  i: ReviewInteraction,
): Promise<Response> {
  const fail = (text: string) =>
    response({
      type: 4,
      data: {
        content: text,
        flags: EPHEMERAL,
        allowed_mentions: { parse: [] },
      },
    });
  if (
    i.guild_id !== env.DISCORD_GUILD_ID ||
    !i.member?.user.id ||
    !holdsCouncil(env, i.member.roles)
  )
    return fail("Only White Council members can assess ideas.");
  const parts = (i.data?.custom_id ?? "").split(":"),
    op = parts[1],
    id = Number(parts[2]),
    rev = Number(parts[3]);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(rev) ||
    rev < 0
  )
    return fail("Invalid assessment control.");
  const actor = {
    id: i.member.user.id,
    name: i.member.user.global_name || i.member.user.username,
  };
  // Modal openings need an immediate response. Other operations are deferred
  // before touching D1 or Discord so rate limits cannot exhaust Discord's ACK.
  const openModal = i.type === 3 && (op === "edit" || op === "issues");
  if (openModal) {
    try {
      const idea = await getIdea(env, id);
      if (!idea || idea.status === "resolved")
        return fail("Reopen the idea before changing its assessment.");
      if (!idea.review_thread_id || i.channel_id !== idea.review_thread_id)
        return fail("Use the private review thread.");
      const r = await getReview(env, idea);
      if (r.revision !== rev || r.status !== "open")
        return fail("This assessment changed or closed. Refresh it.");
      const d: ReviewDraft = JSON.parse(r.draft);
      if (op === "edit")
        return modal(`review:save:${id}:${rev}`, "Adjust Council assessment", [
          ...CRITERIA.map((c) =>
            textInput(
              c.id,
              `${c.name} (1–5): score | reason`,
              d.scores[c.id] === null
                ? ""
                : `${d.scores[c.id]} | ${d.reasons[c.id]}`,
              504,
              false,
            ),
          ),
          textInput(
            "note",
            "Internal note / response guidance",
            d.note,
            1000,
            false,
          ),
          textInput("why", "Why are you changing this assessment?", "", 500),
        ]);
      const chosen = i.data?.values ?? [];
      if (
        chosen.some((x) => !CHECKS.some((c) => c.id === x)) ||
        new Set(chosen).size !== chosen.length
      )
        return fail("Invalid issues.");
      // Encode the finite selection as a six-bit mask, never free-form client text.
      const mask = CHECKS.reduce(
        (n, c, j) => n + (chosen.includes(c.id) ? 2 ** j : 0),
        0,
      );
      return modal(
        `review:setissues:${id}:${rev}:${mask}`,
        "Issues requiring action",
        [
          textInput(
            "reason",
            "Explain selected issues (or their removal)",
            d.issueReason,
            1000,
            true,
          ),
        ],
      );
    } catch (e) {
      console.error("review modal", e);
      return fail("Could not open assessment. Try again.");
    }
  }
  ctx.waitUntil(
    (async () => {
      const webhook = `https://discord.com/api/v10/webhooks/${i.application_id}/${i.token}/messages/@original`;
      try {
        const idea = await getIdea(env, id);
        if (!idea) throw Error("Unknown idea.");
        if (!idea.review_thread_id || i.channel_id !== idea.review_thread_id)
          throw Error("Use the private Council review thread.");
        let r = await getReview(env, idea);
        const readOnly = ["open", "refresh", "preview"].includes(op);
        if (!readOnly && (r.revision !== rev || idea.status === "resolved"))
          throw Error(
            "Assessment changed or idea resolved. Refresh or reopen the idea.",
          );
        if (op === "save" && i.type === 5) {
          const values = inputs(i),
            d: ReviewDraft = JSON.parse(r.draft);
          for (const c of CRITERIA) {
            const input = (values[c.id] ?? "").trim();
            if (!input) {
              d.scores[c.id] = null;
              delete d.reasons[c.id];
              continue;
            }
            const m = input.match(/^([1-5])\s*\|\s*(.+)$/s);
            if (!m)
              throw Error(
                `${c.name}: enter a score and reason, e.g. 4 | Useful improvement.`,
              );
            d.scores[c.id] = Number(m[1]);
            d.reasons[c.id] = m[2].trim();
          }
          d.note = values.note ?? "";
          await editReview(env, r, idea, d, actor, values.why ?? "");
        } else if (op === "setissues" && i.type === 5) {
          const mask = Number(parts[4]);
          if (!Number.isInteger(mask) || mask < 0 || mask > 63)
            throw Error("Invalid selection.");
          const values = inputs(i),
            d: ReviewDraft = JSON.parse(r.draft);
          d.issues = CHECKS.filter((_, j) => mask & (2 ** j)).map((c) => c.id);
          d.issueReason = d.issues.length ? (values.reason ?? "") : "";
          await editReview(env, r, idea, d, actor, values.reason ?? "");
        } else if (op === "agree" && i.type === 3)
          await agreeReview(env, r, actor);
        else if (op === "withdraw" && i.type === 3)
          await withdrawAgreement(env, r, actor);
        else if (op === "publish" && i.type === 3)
          await publish(env, idea, r, actor);
        else if (op === "reopen" && i.type === 3) {
          if (r.status !== "published")
            throw Error("Only closed assessments can be reopened.");
          await reopen(env, r, idea, actor);
        } else if (!readOnly) throw Error("Unknown assessment action.");
        r = await getReview(env, idea);
        const payload = await reviewPayload(env, idea, r);
        if (op === "preview") {
          const text = feedbackFor(idea, JSON.parse(r.draft));
          payload.embeds = [];
          for (let n = 0; n < text.length; n += 3500)
            payload.embeds.push({
              title:
                n === 0
                  ? "Internal summary preview — not recorded"
                  : "Continued",
              description: text.slice(n, n + 3500),
              color: 0x5865f2,
              fields: [],
            });
        }
        await discordFetch(env, webhook, {
          method: "PATCH",
          unauthenticated: true,
          body: payload,
        });
      } catch (e) {
        console.error("native review", e);
        await discordFetch(env, webhook, {
          method: "PATCH",
          unauthenticated: true,
          body: {
            content:
              (e as Error).message ||
              "Assessment failed. Refresh and try again.",
            embeds: [],
            components: [
              {
                type: 1,
                components: [
                  button("Refresh assessment", `review:refresh:${id}:0`),
                ],
              },
            ],
            allowed_mentions: { parse: [] },
          },
        }).catch(() => {});
      }
    })(),
  );
  return response({ type: 5, data: { flags: EPHEMERAL } });
}
async function reopen(
  env: Env,
  r: SharedReview,
  idea: IdeaRow,
  actor: Reviewer,
) {
  // Reopening is an explicit change, not an accidental edit of a final result.
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET status='open',revision=revision+1,idea_content=?,record_message_id=NULL WHERE idea_id=? AND revision=? AND status='published'`,
    ).bind(contentOf(idea), idea.id, r.revision),
    env.DB.prepare(
      `INSERT INTO council_review_events(idea_id,revision,action,actor_id,actor_name,snapshot,reason,at) SELECT idea_id,revision,'reopen',?,?,draft,'Reopened for discussion',? FROM council_reviews WHERE idea_id=? AND revision=? AND changes()=1`,
    ).bind(
      actor.id,
      actor.name,
      Math.floor(Date.now() / 1000),
      idea.id,
      r.revision + 1,
    ),
  ]);
  if (!result[0].meta.changes) throw Error("Assessment changed. Refresh it.");
}
