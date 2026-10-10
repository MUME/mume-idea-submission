// GET /api/edit-target — if the caller has a pending /idea-edit intent, return
// the target idea's answers so the form can pre-fill.

import type { Answers, Env } from "../types";
import { KV } from "../constants";
import { getIdea } from "../lib/db";
import { verifySession } from "../lib/session";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function handleEditTarget(env: Env, request: Request): Promise<Response> {
  const token = bearer(request);
  const session = token ? await verifySession(token, env.SESSION_SIGNING_KEY) : null;
  if (!session) return json({ editing: false }, 401);

  const raw = await env.CONFIG.get(KV.editIntent(session.u));
  if (!raw) return json({ editing: false });

  const { ideaId } = JSON.parse(raw) as { ideaId: number };
  const idea = await getIdea(env, ideaId);
  if (!idea) return json({ editing: false });

  return json({ editing: true, idea: idea.id, answers: JSON.parse(idea.answers) as Answers });
}
