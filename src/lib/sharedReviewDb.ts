import type { Env, IdeaRow } from "../types";
import {
  contentOf,
  emptyDraft,
  validateDraft,
  draftResult,
  AGREEMENTS_REQUIRED,
  scoreSignature,
  checksSignature,
} from "./sharedReview";
import type { ReviewDraft, Reviewer } from "./sharedReview";
export interface SharedReview {
  idea_id: number;
  revision: number;
  rubric_version: number;
  idea_content: string;
  draft: string;
  status: string;
  record_message_id: string | null;
  score_revision: number;
  checks_revision: number;
  checks_proposer_id: string | null;
  checks_proposer_name: string | null;
  checks_seconder_id: string | null;
  checks_seconder_name: string | null;
}
const now = () => Math.floor(Date.now() / 1000);
export async function getReview(
  env: Env,
  idea: IdeaRow,
): Promise<SharedReview> {
  const old = await env.DB.prepare(
    "SELECT * FROM council_reviews WHERE idea_id=?",
  )
    .bind(idea.id)
    .first<SharedReview>();
  if (old) return old;
  // Import v1 values as an unagreed draft; old seconds are not whole-review votes.
  const draft = emptyDraft();
  const legacy = await env.DB.prepare(
    `SELECT i.* FROM assessment_items i JOIN assessments a ON a.id=i.assessment_id WHERE a.idea_id=?`,
  )
    .bind(idea.id)
    .all<any>();
  for (const i of legacy.results ?? []) {
    if (i.item_id in draft.scores) {
      draft.scores[i.item_id] = i.value;
      draft.reasons[i.item_id] = i.reason;
    } else if (i.value === 1) {
      draft.issues.push(i.item_id);
      draft.issueReason += `${i.item_id}: ${i.reason}\n`;
    }
  }
  // Legacy reasons may exceed the new form limits. Preserve them in old tables;
  // truncate only this editable import to match native Discord inputs.
  Object.keys(draft.reasons).forEach(
    (k) => (draft.reasons[k] = draft.reasons[k].slice(0, 500)),
  );
  draft.issueReason = draft.issueReason.slice(0, 1000);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO council_reviews(idea_id,idea_content,draft,updated_at) VALUES(?,?,?,?)`,
  )
    .bind(idea.id, contentOf(idea), JSON.stringify(draft), now())
    .run();
  return (await env.DB.prepare("SELECT * FROM council_reviews WHERE idea_id=?")
    .bind(idea.id)
    .first<SharedReview>())!;
}
export async function agreements(
  env: Env,
  r: SharedReview,
): Promise<Reviewer[]> {
  const res = await env.DB.prepare(
    "SELECT actor_id AS id, actor_name AS name FROM council_score_agreements WHERE idea_id=? AND score_revision=? ORDER BY at,actor_id",
  )
    .bind(r.idea_id, r.score_revision)
    .all<Reviewer>();
  return res.results ?? [];
}
function event(
  env: Env,
  r: SharedReview,
  action: string,
  actor: Reviewer,
  reason: string,
) {
  return env.DB.prepare(
    `INSERT INTO council_review_events(idea_id,revision,action,actor_id,actor_name,snapshot,reason,at)
    SELECT idea_id,revision,?, ?, ?,draft,?,? FROM council_reviews WHERE idea_id=? AND revision=? AND changes()=1`,
  ).bind(action, actor.id, actor.name, reason, now(), r.idea_id, r.revision);
}
function liveContentSql() {
  return `idea_content=(SELECT json_array(title,answers,schema_version) FROM ideas WHERE id=council_reviews.idea_id)`;
}
// SQL JSON uses the same serialized array as contentOf for these fields.
export async function editReview(
  env: Env,
  r: SharedReview,
  idea: IdeaRow,
  draft: ReviewDraft,
  actor: Reviewer,
  reason: string,
): Promise<void> {
  validateDraft(draft);
  if (!reason.trim() || reason.length > 1000)
    throw Error("Explain the revision (up to 1000 characters).");
  const previous: ReviewDraft = JSON.parse(r.draft);
  const contentChanged = r.idea_content !== contentOf(idea);
  const scoresChanged =
    contentChanged || scoreSignature(previous) !== scoreSignature(draft);
  const checksChanged =
    contentChanged ||
    checksSignature(previous) !== checksSignature(draft) ||
    (draft.issues.length > 0 && !r.checks_proposer_id);
  if (r.draft === JSON.stringify(draft) && !contentChanged && !checksChanged)
    throw Error("No assessment changes to save.");
  const next = { ...r, revision: r.revision + 1 };
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET draft=?,idea_content=?,revision=revision+1,
       score_revision=score_revision+?,checks_revision=checks_revision+?,
       checks_proposer_id=CASE WHEN ? THEN ? ELSE checks_proposer_id END,
       checks_proposer_name=CASE WHEN ? THEN ? ELSE checks_proposer_name END,
       checks_seconder_id=CASE WHEN ? THEN NULL ELSE checks_seconder_id END,
       checks_seconder_name=CASE WHEN ? THEN NULL ELSE checks_seconder_name END,
       status='open',record_message_id=NULL,updated_at=? WHERE idea_id=? AND revision=? AND status='open' AND (SELECT status FROM ideas WHERE id=?)!='resolved'`,
    ).bind(
      JSON.stringify(draft),
      contentOf(idea),
      Number(scoresChanged),
      Number(checksChanged),
      Number(checksChanged),
      draft.issues.length ? actor.id : null,
      Number(checksChanged),
      draft.issues.length ? actor.name : null,
      Number(checksChanged),
      Number(checksChanged),
      now(),
      r.idea_id,
      r.revision,
      r.idea_id,
    ),
    event(env, next, "revise", actor, reason),
  ]);
  if (!res[0].meta.changes)
    throw Error("Assessment changed or is closed. Refresh before editing.");
}
export async function agreeReview(
  env: Env,
  r: SharedReview,
  actor: Reviewer,
): Promise<void> {
  validateDraft(JSON.parse(r.draft));
  if (draftResult(JSON.parse(r.draft)).total === null)
    throw Error(
      "Complete all three scores before agreeing to the final scores.",
    );
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO council_score_agreements(idea_id,score_revision,actor_id,actor_name,at)
      SELECT idea_id,score_revision,?,?,? FROM council_reviews WHERE idea_id=? AND revision=? AND status='open' AND ${liveContentSql()} AND (SELECT status FROM ideas WHERE id=?)!='resolved'`,
    ).bind(actor.id, actor.name, now(), r.idea_id, r.revision, r.idea_id),
    env.DB.prepare(
      `INSERT INTO council_review_events(idea_id,revision,action,actor_id,actor_name,snapshot,reason,at)
      SELECT r.idea_id,r.revision,'agree_scores',?,?,r.draft,'',? FROM council_reviews r
      WHERE r.idea_id=? AND r.revision=? AND r.status='open' AND changes()=1 AND EXISTS(SELECT 1 FROM council_score_agreements a WHERE a.idea_id=r.idea_id AND a.score_revision=r.score_revision AND a.actor_id=?)`,
    ).bind(actor.id, actor.name, now(), r.idea_id, r.revision, actor.id),
  ]);
  if (!res[0].meta.changes)
    throw Error("Already agreed, or the idea/assessment changed. Refresh it.");
}
export async function withdrawAgreement(
  env: Env,
  r: SharedReview,
  actor: Reviewer,
): Promise<void> {
  const res = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM council_score_agreements WHERE idea_id=? AND score_revision=? AND actor_id=? AND EXISTS(SELECT 1 FROM council_reviews WHERE idea_id=? AND revision=? AND status='open')`,
    ).bind(r.idea_id, r.score_revision, actor.id, r.idea_id, r.revision),
    event(env, r, "withdraw_scores", actor, ""),
  ]);
  if (!res[0].meta.changes)
    throw Error("No current agreement to withdraw, or assessment closed.");
}
export async function secondChecks(
  env: Env,
  r: SharedReview,
  actor: Reviewer,
): Promise<void> {
  const draft: ReviewDraft = JSON.parse(r.draft);
  if (!draft.issues.length)
    throw Error("No checks selected; they pass by default.");
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET checks_seconder_id=?,checks_seconder_name=?,updated_at=?
      WHERE idea_id=? AND revision=? AND status='open' AND checks_proposer_id IS NOT NULL
      AND checks_proposer_id!=? AND checks_seconder_id IS NULL AND ${liveContentSql()}
      AND (SELECT status FROM ideas WHERE id=?)!='resolved'`,
    ).bind(
      actor.id,
      actor.name,
      now(),
      r.idea_id,
      r.revision,
      actor.id,
      r.idea_id,
    ),
    event(
      env,
      r,
      "second_checks",
      actor,
      "Seconded all selected checks and their explanation",
    ),
  ]);
  if (!res[0].meta.changes)
    throw Error(
      "A different member must second the current checks. They may already be seconded or have changed.",
    );
}
export async function withdrawChecksSecond(
  env: Env,
  r: SharedReview,
  actor: Reviewer,
): Promise<void> {
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET checks_seconder_id=NULL,checks_seconder_name=NULL,updated_at=?
      WHERE idea_id=? AND revision=? AND status='open' AND checks_seconder_id=?`,
    ).bind(now(), r.idea_id, r.revision, actor.id),
    event(env, r, "withdraw_checks_second", actor, ""),
  ]);
  if (!res[0].meta.changes)
    throw Error(
      "You have no current second to withdraw, or the assessment is closed.",
    );
}
export async function reservePublish(env: Env, r: SharedReview): Promise<void> {
  validateDraft(JSON.parse(r.draft));
  if (!draftResult(JSON.parse(r.draft)).ready)
    throw Error("Assessment incomplete.");
  const res = await env.DB.prepare(
    `UPDATE council_reviews SET status='publishing',updated_at=?
    WHERE idea_id=? AND revision=? AND status IN ('open','publishing') AND ${liveContentSql()}
    AND (SELECT status FROM ideas WHERE id=?)!='resolved'
    AND (
      (json_array_length(json_extract(draft,'$.issues'))>0 AND checks_proposer_id IS NOT NULL
       AND checks_seconder_id IS NOT NULL AND checks_proposer_id!=checks_seconder_id)
      OR (json_array_length(json_extract(draft,'$.issues'))=0
       AND (SELECT COUNT(*) FROM council_score_agreements WHERE idea_id=council_reviews.idea_id
         AND score_revision=council_reviews.score_revision)>=?)
    )`,
  )
    .bind(now(), r.idea_id, r.revision, r.idea_id, AGREEMENTS_REQUIRED)
    .run();
  if (!res.meta.changes)
    throw Error(
      "Selected checks need a second; final scores need three agreements. Refresh if the idea or assessment changed.",
    );
}
export async function finishPublish(
  env: Env,
  r: SharedReview,
  messageId: string,
  actor: Reviewer,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET status='published',record_message_id=?,updated_at=? WHERE idea_id=? AND revision=? AND status='publishing'`,
    ).bind(messageId, now(), r.idea_id, r.revision),
    event(env, r, "publish", actor, messageId),
  ]);
}

// Friendly preflight for the Discord status selector. updateStatus repeats this
// condition atomically so a concurrent edit/withdrawal cannot slip past it.
export async function canMarkReviewed(
  env: Env,
  idea: IdeaRow,
): Promise<boolean> {
  const r = await env.DB.prepare(
    "SELECT * FROM council_reviews WHERE idea_id=?",
  )
    .bind(idea.id)
    .first<SharedReview>();
  if (!r || r.idea_content !== contentOf(idea)) return false;
  const draft: ReviewDraft = JSON.parse(r.draft);
  validateDraft(draft);
  return (
    draftResult(draft).total !== null &&
    (await agreements(env, r)).length >= AGREEMENTS_REQUIRED
  );
}
