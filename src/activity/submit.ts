// POST /api/submit — validate, store, and post to the forum (build spec §8).

import type { Env, Session } from "../types";
import { KV } from "../constants";
import { loadLiveConfig } from "../lib/config";
import { attachThread, getIdea, insertIdea, logStatus, updateIdeaAnswers } from "../lib/db";
import { verifySession } from "../lib/session";
import { validateAnswers } from "../lib/validate";
import { addVoteReaction, autoFollow, createIdeaPost, postThreadLine, refreshIdeaPost } from "../discord/forum";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function handleSubmit(env: Env, request: Request): Promise<Response> {
  // 1. Verify the session token, resolve the author from it (never the body).
  const token = bearer(request);
  const session = token ? await verifySession(token, env.SESSION_SIGNING_KEY) : null;
  if (!session) return json({ error: "unauthorized" }, 401);
  if (session.g !== env.DISCORD_GUILD_ID) return json({ error: "wrong_guild" }, 403);

  let body: { answers?: unknown; edit?: unknown };
  try {
    body = (await request.json()) as { answers?: unknown; edit?: unknown };
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  // Edit path: refine an existing idea in place (authorised via the /idea-edit intent).
  if (typeof body.edit === "number") {
    return handleEditSubmit(env, session, body.edit, body.answers);
  }

  // 2. Validate every answer against the live config.
  const config = await loadLiveConfig(env);
  const { ok, errors, clean } = validateAnswers(config, body.answers);
  if (!ok) return json({ errors }, 422); // 3. field-keyed errors -> bottom bar

  const titleField = config.embed.titleField;
  const title = String(clean[titleField] ?? "").slice(0, 100) || "Untitled idea";
  const now = Math.floor(Date.now() / 1000);

  // 4. Insert first so the row survives even if the forum post fails.
  const idea = await insertIdea(
    env,
    {
      guildId: session.g,
      authorId: session.u,
      authorName: session.n,
      title,
      schemaVersion: config.version,
      answers: clean,
    },
    now,
  );

  // 5-8. Create the post, attach ids, react, log. If any of this fails after the
  // row committed, keep the row (thread_id null) for the cron to retry.
  try {
    const { threadId, messageId } = await createIdeaPost(env, idea, config);
    await attachThread(env, idea.id, threadId, messageId, now);
    await addVoteReaction(env, threadId, messageId).catch((e) => console.error("reaction failed", e));
    await logStatus(env, idea.id, null, "in_proposal", session.u, session.n, now);
    await autoFollow(env, threadId, session.u).catch((e) => console.error("auto-follow failed", e));

    const threadUrl = `https://discord.com/channels/${session.g}/${threadId}`;
    return json({ ok: true, idea: idea.id, threadUrl });
  } catch (err) {
    console.error(`forum post failed for idea ${idea.id}`, err);
    // Row is saved; cron will retry the post (spec §8, §10).
    return json(
      {
        ok: true,
        idea: idea.id,
        pending: true,
        message: "Your idea is saved and will be posted to the forum shortly.",
      },
      202,
    );
  }
}

// Refine an existing idea: re-validate, overwrite the answers, re-render the post.
async function handleEditSubmit(
  env: Env,
  session: Session,
  ideaId: number,
  rawAnswers: unknown,
): Promise<Response> {
  // The authorised idea comes from the server-side intent, not the client.
  const intentRaw = await env.CONFIG.get(KV.editIntent(session.u));
  const intent = intentRaw ? (JSON.parse(intentRaw) as { ideaId: number }) : null;
  if (!intent || intent.ideaId !== ideaId) return json({ error: "edit_not_authorized" }, 403);

  const idea = await getIdea(env, ideaId);
  if (!idea) return json({ error: "not_found" }, 404);

  const config = await loadLiveConfig(env);
  const { ok, errors, clean } = validateAnswers(config, rawAnswers);
  if (!ok) return json({ errors }, 422);

  const title = String(clean[config.embed.titleField] ?? "").slice(0, 100) || idea.title;
  const now = Math.floor(Date.now() / 1000);
  await updateIdeaAnswers(env, ideaId, title, clean, config.version, now);

  const updated = { ...idea, title, answers: JSON.stringify(clean), schema_version: config.version, updated_at: now };
  await refreshIdeaPost(env, updated, config).catch((e) => console.error("post refresh failed", e));
  if (idea.thread_id) {
    await postThreadLine(env, idea.thread_id, `Idea ${ideaId} edited by <@${session.u}>`).catch(() => {});
  }
  await env.CONFIG.delete(KV.editIntent(session.u));

  const threadUrl = idea.thread_id ? `https://discord.com/channels/${session.g}/${idea.thread_id}` : undefined;
  return json({ ok: true, idea: ideaId, threadUrl, edited: true });
}
