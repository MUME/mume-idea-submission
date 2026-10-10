// Status transition rules (build spec §9). Pure function so it can be unit tested
// in isolation from Discord.

import type { Status } from "../types";

export interface Actor {
  isCouncil: boolean;
  isAuthor: boolean;
}

export type TransitionDecision =
  | { ok: true }
  | { ok: false; reason: string };

export function decideTransition(from: Status, to: Status, actor: Actor): TransitionDecision {
  if (from === to) return { ok: false, reason: "That is already the current status." };

  // Resolved: a terminal close. Council only, reachable from any stage. Locks the thread.
  if (to === "resolved") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can resolve an idea." };
    return { ok: true };
  }
  // Reopening a resolved idea back to any earlier stage: Council only.
  if (from === "resolved") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can reopen a resolved idea." };
    return { ok: true };
  }

  // Reviewed: Council only, and only after it has been Submitted.
  if (to === "approved") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can mark an idea as Reviewed." };
    if (from !== "submitted") return { ok: false, reason: "An idea must be Submitted before it can be Reviewed." };
    return { ok: true };
  }

  // Council can walk a Reviewed or Submitted idea back a stage for more work.
  if (from === "approved") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can reopen a Reviewed idea." };
    return { ok: true };
  }
  if (from === "submitted") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can reopen a Submitted idea." };
    return { ok: true };
  }

  if (to === "submitted") {
    if (!actor.isCouncil) return { ok: false, reason: "Only the White Council can mark an idea as Submitted." };
    return { ok: true };
  }

  // in_proposal <-> final_draft: author or council.
  const isProposalDraftMove =
    (from === "in_proposal" && to === "final_draft") || (from === "final_draft" && to === "in_proposal");
  if (isProposalDraftMove) {
    if (actor.isCouncil || actor.isAuthor) return { ok: true };
    return { ok: false, reason: "This is not your idea to change." };
  }

  return { ok: false, reason: "That status change is not allowed." };
}
