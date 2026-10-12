// Pure shared-draft rules. All agreements cover the complete, exact revision.
import { CRITERIA, CHECKS, BANDS } from "./rubric";
import type { IdeaRow } from "../types";
export const AGREEMENTS_REQUIRED = 3;
export interface ReviewDraft {
  scores: Record<string, number | null>;
  reasons: Record<string, string>;
  issues: string[];
  issueReason: string;
  note: string;
}
export interface Reviewer {
  id: string;
  name: string;
}
export const emptyDraft = (): ReviewDraft => ({
  scores: { usefulness: null, feasibility: null, interest: null },
  reasons: {},
  issues: [],
  issueReason: "",
  note: "",
});
export function contentOf(
  idea: Pick<IdeaRow, "title" | "answers" | "schema_version">,
): string {
  return JSON.stringify([idea.title, idea.answers, idea.schema_version]);
}
export function validateDraft(d: ReviewDraft): void {
  if (!d || !d.scores || !d.reasons || !Array.isArray(d.issues))
    throw Error("Invalid assessment.");
  for (const c of CRITERIA) {
    const v = d.scores[c.id];
    if (v !== null && (!Number.isInteger(v) || v < 1 || v > 5))
      throw Error("Scores must be 1–5, or blank.");
    if (
      v !== null &&
      (!d.reasons[c.id]?.trim() || d.reasons[c.id].length > 500)
    )
      throw Error("Explain each score (up to 500 characters).");
  }
  if (
    d.issues.length > CHECKS.length ||
    new Set(d.issues).size !== d.issues.length ||
    d.issues.some((id) => !CHECKS.some((c) => c.id === id))
  )
    throw Error("Unknown or duplicate issue.");
  if (
    typeof d.issueReason !== "string" ||
    d.issueReason.length > 1000 ||
    (d.issues.length && !d.issueReason.trim())
  )
    throw Error("Explain the selected issues (up to 1000 characters).");
  if (typeof d.note !== "string" || d.note.length > 1000)
    throw Error("Feedback must be at most 1000 characters.");
}
export function draftResult(d: ReviewDraft) {
  const flags = CHECKS.filter((c) => d.issues.includes(c.id));
  const complete = CRITERIA.every((c) => Number.isInteger(d.scores[c.id]));
  const total = complete
    ? CRITERIA.reduce((n, c) => n + d.scores[c.id]! * c.weight, 0)
    : null;
  return {
    flags,
    total,
    band:
      !flags.length && total !== null
        ? BANDS.find((b) => total <= b.max)!
        : null,
    ready: flags.length ? !!d.issueReason.trim() : complete,
  };
}
export function feedbackFor(
  idea: Pick<IdeaRow, "id" | "title">,
  d: ReviewDraft,
): string {
  const r = draftResult(d);
  const lines = [`Idea #${idea.id} — ${idea.title}`];
  if (r.flags.length) {
    lines.push("Further action required");
    for (const c of r.flags) lines.push(`${c.action}: ${c.feedback}`);
    lines.push(`Council explanation: ${d.issueReason}`);
  } else if (r.band) {
    lines.push(`${r.band.name} · ${r.total}/20`);
    for (const c of CRITERIA)
      lines.push(
        `${c.name}: ${d.scores[c.id]}/5${c.weight === 2 ? " (×2)" : ""} — ${d.reasons[c.id]}`,
      );
    lines.push(r.band.feedback);
  } else lines.push("Draft — scores incomplete.");
  if (d.note.trim()) lines.push(d.note.trim());
  lines.push("A recommendation does not guarantee implementation.");
  return lines.join("\n\n");
}
