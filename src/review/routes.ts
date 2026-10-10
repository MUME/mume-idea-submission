// Council idea review: the off-site assessment surface. Gated on the same
// White-Council Discord login as the admin CMS, reading ideas from the shared D1
// and posting the agreed result back to the idea's review thread.

import type { Env, IdeaRow } from "../types";
import { beginLogin, currentAdmin } from "../admin/routes";
import { getIdea } from "../lib/db";
import { loadConfigVersion, fieldById } from "../lib/config";
import { answerText } from "../discord/embed";
import { postThreadLine } from "../discord/forum";
import { renderReviewPage } from "./page";
import {
  AssessError,
  Actor,
  getAssessmentMeta,
  getOrCreateAssessment,
  loadAssignments,
  markPublished,
  propose,
  second,
} from "../lib/assess";
import { BANDS, CHECKS, CRITERIA, computeResult, feedbackText } from "../lib/rubric";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function actorOf(admin: { u: string; n?: string }): Actor {
  return { id: admin.u, name: admin.n && admin.n.trim() ? admin.n : "Council" };
}

function ideaRef(idea: IdeaRow): string {
  return `#${idea.id} — ${idea.title}`;
}

// A readable rendering of the idea's own answers, using the config version it was
// stamped against (labels never drift).
async function ideaContent(env: Env, idea: IdeaRow): Promise<Array<{ label: string; text: string }>> {
  const out: Array<{ label: string; text: string }> = [];
  try {
    const config = await loadConfigVersion(env, idea.schema_version);
    const answers = JSON.parse(idea.answers || "{}");
    const ids = [config.embed.bodyField, ...(config.embed.summaryFields ?? []), ...(config.embed.detailFields ?? [])];
    const seen = new Set<string>();
    for (const fid of ids) {
      if (!fid || seen.has(fid)) continue;
      seen.add(fid);
      const field = fieldById(config, fid);
      if (!field) continue;
      const text = answerText(field, answers[fid]);
      if (!text || text === "—") continue;
      out.push({ label: field.embedLabel ?? field.label, text });
    }
  } catch {
    /* fall back to just the title if the config can't be read */
  }
  return out;
}

async function stateFor(env: Env, idea: IdeaRow, admin: { u: string; n?: string }) {
  const meta = await getAssessmentMeta(env, idea.id);
  const assignments = meta ? await loadAssignments(env, meta.id) : {};
  return {
    me: { id: admin.u, name: actorOf(admin).name },
    idea: { id: idea.id, ref: ideaRef(idea), title: idea.title, status: idea.status, content: await ideaContent(env, idea) },
    rubric: { criteria: CRITERIA, checks: CHECKS, bands: BANDS },
    assignments,
    result: computeResult(assignments),
    assessment: { status: meta?.status ?? "open", published_at: meta?.published_at ?? null },
  };
}

// GET /admin/review?idea=N — the SPA (login-gated, returns here after OAuth).
export async function handleReviewPage(env: Env, request: Request): Promise<Response> {
  const admin = await currentAdmin(env, request);
  if (!admin) {
    const url = new URL(request.url);
    return beginLogin(env, `/admin/review${url.search}`);
  }
  return new Response(renderReviewPage(), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// /admin/api/assess/:id[/propose|/second|/publish]
export async function handleReviewApi(env: Env, request: Request): Promise<Response> {
  const admin = await currentAdmin(env, request);
  if (!admin) return json({ error: "Sign in with your White Council account." }, 401);
  const actor = actorOf(admin);

  const url = new URL(request.url);
  const m = url.pathname.match(/^\/admin\/api\/assess\/(\d+)(?:\/(propose|second|publish))?$/);
  if (!m) return json({ error: "not found" }, 404);
  const ideaId = Number(m[1]);
  const op = m[2];

  const idea = await getIdea(env, ideaId);
  if (!idea) return json({ error: "Unknown idea." }, 404);

  try {
    if (!op && request.method === "GET") {
      return json(await stateFor(env, idea, admin));
    }
    if (op === "propose" && request.method === "POST") {
      const b = (await request.json()) as any;
      const a = await getOrCreateAssessment(env, ideaId);
      await propose(env, a.id, String(b.item_id), Number(b.value), String(b.reason ?? ""), actor);
      return json(await stateFor(env, idea, admin));
    }
    if (op === "second" && request.method === "POST") {
      const b = (await request.json()) as any;
      const a = await getOrCreateAssessment(env, ideaId);
      await second(env, a.id, String(b.item_id), Number(b.revision), actor);
      return json(await stateFor(env, idea, admin));
    }
    if (op === "publish" && request.method === "POST") {
      const b = (await request.json()) as any;
      const meta = await getAssessmentMeta(env, ideaId);
      const assignments = meta ? await loadAssignments(env, meta.id) : {};
      const result = computeResult(assignments);
      if (result.status === "Assessment in progress") {
        return json({ error: "Finish seconding every check and score before publishing." }, 400);
      }
      const note = String(b.note ?? "");
      const text = feedbackText(ideaRef(idea), assignments, note);
      const target = idea.review_thread_id || idea.thread_id;
      if (!target) return json({ error: "This idea has no thread to post to yet." }, 400);
      await postThreadLine(env, target, `**Council assessment**\n${text}`);
      const a = await getOrCreateAssessment(env, ideaId);
      await markPublished(env, a.id, actor);
      return json(await stateFor(env, idea, admin));
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (e instanceof AssessError) return json({ error: e.message }, 400);
    console.error("review api error", e);
    return json({ error: "Something went wrong." }, 500);
  }
}
