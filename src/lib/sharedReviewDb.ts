import type { Env, IdeaRow } from "../types";
import {
  contentOf,
  emptyDraft,
  validateDraft,
  draftResult,
  AGREEMENTS_REQUIRED,
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
    "SELECT actor_id AS id, actor_name AS name FROM council_review_agreements WHERE idea_id=? AND revision=? ORDER BY at,actor_id",
  )
    .bind(r.idea_id, r.revision)
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
  if (r.draft === JSON.stringify(draft) && r.idea_content === contentOf(idea))
    throw Error("No assessment changes to save.");
  const next = { ...r, revision: r.revision + 1 };
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE council_reviews SET draft=?,idea_content=?,revision=revision+1,status='open',record_message_id=NULL,updated_at=? WHERE idea_id=? AND revision=? AND status='open' AND (SELECT status FROM ideas WHERE id=?)!='resolved'`,
    ).bind(
      JSON.stringify(draft),
      contentOf(idea),
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
  if (!draftResult(JSON.parse(r.draft)).ready)
    throw Error(
      "Complete the scores or explain the selected issues before agreeing.",
    );
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO council_review_agreements(idea_id,revision,actor_id,actor_name,at)
      SELECT idea_id,revision,?,?,? FROM council_reviews WHERE idea_id=? AND revision=? AND status='open' AND ${liveContentSql()} AND (SELECT status FROM ideas WHERE id=?)!='resolved'`,
    ).bind(actor.id, actor.name, now(), r.idea_id, r.revision, r.idea_id),
    env.DB.prepare(
      `INSERT INTO council_review_events(idea_id,revision,action,actor_id,actor_name,snapshot,reason,at)
      SELECT r.idea_id,r.revision,'agree',?,?,r.draft,'',? FROM council_reviews r
      WHERE r.idea_id=? AND r.revision=? AND r.status='open' AND changes()=1 AND EXISTS(SELECT 1 FROM council_review_agreements a WHERE a.idea_id=r.idea_id AND a.revision=r.revision AND a.actor_id=?)`,
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
      `DELETE FROM council_review_agreements WHERE idea_id=? AND revision=? AND actor_id=? AND EXISTS(SELECT 1 FROM council_reviews WHERE idea_id=? AND revision=? AND status='open')`,
    ).bind(r.idea_id, r.revision, actor.id, r.idea_id, r.revision),
    event(env, r, "withdraw", actor, ""),
  ]);
  if (!res[0].meta.changes)
    throw Error("No current agreement to withdraw, or assessment closed.");
}
export async function reservePublish(env: Env, r: SharedReview): Promise<void> {
  validateDraft(JSON.parse(r.draft));
  if (!draftResult(JSON.parse(r.draft)).ready)
    throw Error("Assessment incomplete.");
  const res = await env.DB.prepare(
    `UPDATE council_reviews SET status='publishing',updated_at=? WHERE idea_id=? AND revision=? AND status IN ('open','publishing') AND ${liveContentSql()} AND (SELECT status FROM ideas WHERE id=?)!='resolved' AND (SELECT COUNT(*) FROM council_review_agreements WHERE idea_id=? AND revision=?)>=?`,
  )
    .bind(
      now(),
      r.idea_id,
      r.revision,
      r.idea_id,
      r.idea_id,
      r.revision,
      AGREEMENTS_REQUIRED,
    )
    .run();
  if (!res.meta.changes)
    throw Error(
      "Three current agreements are required. The idea may have changed or already be closed.",
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
