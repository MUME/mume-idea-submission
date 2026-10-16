// Assessment persistence + mutation rules for the Council idea review.
// All authority/validation is enforced here (server-side); the client only renders.

import type { Env } from "../types";
import { Assignment, Assignments, ITEM_IDS, RUBRIC_VERSION, isValidValue } from "./rubric";

export interface Actor {
  id: string;
  name: string;
}

interface AssessmentRow {
  id: number;
  idea_id: number;
  rubric_version: number;
  status: string;
  published_at: number | null;
}

const now = () => Math.floor(Date.now() / 1000);

// One open assessment per idea; created lazily the first time the idea is reviewed.
export async function getOrCreateAssessment(env: Env, ideaId: number): Promise<AssessmentRow> {
  const existing = await env.DB.prepare("SELECT * FROM assessments WHERE idea_id = ?").bind(ideaId).first<AssessmentRow>();
  if (existing) return existing;
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO assessments (idea_id, rubric_version, status, created_at, updated_at)
     VALUES (?, ?, 'open', ?, ?) RETURNING *`,
  ).bind(ideaId, RUBRIC_VERSION, t, t).first<AssessmentRow>();
  if (!row) throw new Error("could not create assessment");
  return row;
}

export async function loadAssignments(env: Env, assessmentId: number): Promise<Assignments> {
  const res = await env.DB.prepare("SELECT * FROM assessment_items WHERE assessment_id = ?").bind(assessmentId).all<any>();
  const out: Assignments = {};
  for (const r of res.results ?? []) {
    out[r.item_id] = {
      value: r.value,
      reason: r.reason,
      proposerId: r.proposer_id,
      proposerName: r.proposer_name,
      seconderId: r.seconder_id ?? null,
      seconderName: r.seconder_name ?? null,
      revision: r.revision,
    } as Assignment;
  }
  return out;
}

async function log(env: Env, assessmentId: number, itemId: string | null, action: string, actor: Actor, detail?: string) {
  await env.DB.prepare(
    "INSERT INTO assessment_log (assessment_id, item_id, action, actor_id, actor_name, detail, at) VALUES (?,?,?,?,?,?,?)",
  ).bind(assessmentId, itemId, action, actor.id, actor.name, detail ?? null, now()).run();
}

async function touch(env: Env, assessmentId: number) {
  await env.DB.prepare("UPDATE assessments SET updated_at = ? WHERE id = ?").bind(now(), assessmentId).run();
}

export class AssessError extends Error {}

// Propose (or revise) an item. Revising bumps the revision and clears any second,
// so agreement always reflects the current wording.
export async function propose(
  env: Env,
  assessmentId: number,
  itemId: string,
  value: number,
  reason: string,
  actor: Actor,
): Promise<void> {
  if (!ITEM_IDS.includes(itemId)) throw new AssessError("Unknown assessment item.");
  if (!isValidValue(itemId, value)) throw new AssessError("Choose a valid assessment.");
  if (!reason.trim()) throw new AssessError("Please add a reason.");

  const prev = await env.DB.prepare(
    "SELECT revision FROM assessment_items WHERE assessment_id = ? AND item_id = ?",
  ).bind(assessmentId, itemId).first<{ revision: number }>();
  const revision = (prev?.revision ?? 0) + 1;
  const t = now();
  await env.DB.prepare(
    `INSERT INTO assessment_items
       (assessment_id, item_id, value, reason, proposer_id, proposer_name, seconder_id, seconder_name, revision, updated_at)
     VALUES (?,?,?,?,?,?,NULL,NULL,?,?)
     ON CONFLICT(assessment_id, item_id) DO UPDATE SET
       value=excluded.value, reason=excluded.reason, proposer_id=excluded.proposer_id,
       proposer_name=excluded.proposer_name, seconder_id=NULL, seconder_name=NULL,
       revision=excluded.revision, updated_at=excluded.updated_at`,
  ).bind(assessmentId, itemId, value, reason.trim(), actor.id, actor.name, revision, t).run();
  await log(env, assessmentId, itemId, "propose", actor, `rev ${revision}`);
  await touch(env, assessmentId);
}

// Second an item. A different reviewer only, never already seconded, and only the
// exact revision they saw — so a second can't silently attach to edited wording.
export async function second(
  env: Env,
  assessmentId: number,
  itemId: string,
  expectedRevision: number,
  actor: Actor,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT proposer_id, seconder_id, revision FROM assessment_items WHERE assessment_id = ? AND item_id = ?",
  ).bind(assessmentId, itemId).first<{ proposer_id: string; seconder_id: string | null; revision: number }>();
  if (!row) throw new AssessError("There is nothing to second yet.");
  if (row.seconder_id) throw new AssessError("This is already seconded.");
  if (row.proposer_id === actor.id) throw new AssessError("A different reviewer must second this.");
  if (row.revision !== expectedRevision) throw new AssessError("This assessment changed — review it again before seconding.");

  const res = await env.DB.prepare(
    `UPDATE assessment_items SET seconder_id = ?, seconder_name = ?, updated_at = ?
     WHERE assessment_id = ? AND item_id = ? AND revision = ? AND seconder_id IS NULL`,
  ).bind(actor.id, actor.name, now(), assessmentId, itemId, expectedRevision).run();
  if ((res.meta?.changes ?? 0) === 0) throw new AssessError("This assessment just changed — try again.");
  await log(env, assessmentId, itemId, "second", actor, `rev ${expectedRevision}`);
  await touch(env, assessmentId);
}

export async function markPublished(env: Env, assessmentId: number, actor: Actor): Promise<void> {
  const t = now();
  await env.DB.prepare("UPDATE assessments SET status='published', published_at=?, updated_at=? WHERE id=?")
    .bind(t, t, assessmentId).run();
  await log(env, assessmentId, null, "publish", actor);
}

export async function getAssessmentMeta(env: Env, ideaId: number): Promise<AssessmentRow | null> {
  return (await env.DB.prepare("SELECT * FROM assessments WHERE idea_id = ?").bind(ideaId).first<AssessmentRow>()) ?? null;
}
