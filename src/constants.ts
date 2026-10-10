import type { Status } from "./types";

export const STATUSES: Status[] = ["in_proposal", "final_draft", "submitted", "approved", "resolved"];

export const STATUS_LABEL: Record<Status, string> = {
  in_proposal: "In Proposal",
  final_draft: "Final Draft",
  submitted: "Submitted",
  approved: "Reviewed",
  resolved: "Resolved",
};

// Embed accent colours. Green is reserved for final approval; Submitted is blue
// (in the review queue); Resolved is a muted purple for a closed/locked idea.
export const STATUS_COLOR: Record<Status, number> = {
  in_proposal: 0x80848e,
  final_draft: 0xf0b232,
  submitted: 0x5865f2,
  approved: 0x248046,
  resolved: 0x9b59b6,
};

export const STATUS_DESCRIPTION: Record<Status, string> = {
  in_proposal: "Open for discussion and rewrites",
  final_draft: "Author considers it settled",
  submitted: "In the review queue for debate",
  approved: "Reviewed — exported and locked",
  resolved: "Closed — thread locked, no further changes",
};

// Coloured indicator shown next to the status (embeds can't colour text).
export const STATUS_DOT: Record<Status, string> = {
  in_proposal: "⚪",
  final_draft: "🟡",
  submitted: "🔵",
  approved: "🟢",
  resolved: "🟣",
};

// Forum tag names, matched by name against the channel's available_tags.
export const TAG_NAME: Record<Status, string> = {
  in_proposal: "In Proposal",
  final_draft: "Final Draft",
  submitted: "Submitted",
  approved: "Reviewed",
  resolved: "Resolved",
};

// Seeded reactions, in order. With "Add Reactions" denied on the forum channel,
// members can only click these pre-placed emoji — a thumbs up / thumbs down poll.
export const VOTE_EMOJIS = ["👍", "👎"];

// KV keys.
export const KV = {
  liveConfig: "form:config",
  configVersion: (v: number) => `form:config:v${v}`,
  tagIds: "forum:tags",
  pinnedSubmit: "pinned:submit",
  editIntent: (userId: string) => `edit:${userId}`,
  // Marks that the 30-day "still open" notice has been sent for an idea (once only).
  aged30: (ideaId: number) => `aged30:${ideaId}`,
} as const;

// Discord API base.
export const DISCORD_API = "https://discord.com/api/v10";

// Interaction response types.
export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_UPDATE_MESSAGE: 6,
  LAUNCH_ACTIVITY: 12,
} as const;

export const EPHEMERAL = 64;
