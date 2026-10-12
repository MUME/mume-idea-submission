# Council assessment in Discord

This replaces the per-item propose/second workflow from PR #1 with a fluid shared
assessment and three agreements on its complete final wording.

## Review flow

1. In the private submitted-ideas forum, click **Assess idea**. A Council-only,
   ephemeral panel opens inside Discord. Every reviewer reads/edits the same draft
   stored in D1; panels are personal snapshots, so use **Refresh** to see others'
   changes. The interface stacks native Discord embeds, a select menu and buttons.
2. **Issues requiring action** is a multi-select dropdown. Select any applicable
   issues, then explain them in the modal. Nothing selected means the checks pass
   by default. Removing issues also requires a reason. There are no per-item seconds.
3. **Adjust scores / feedback** opens a five-field Discord form: the three scores
   (enter `4 | reason`, for example), final internal Council note / response guidance, and why you are revising
   the assessment. Each score is 1–5; blank means unassessed. Feasibility counts twice
   and measures effort only. With no issues, all three scores are required before
   agreement. With issues, explained return/defer feedback can be agreed without
   finishing numeric scores. No-change submissions do not invalidate agreements.
4. Each Council member explicitly clicks **Agree with assessment** on the version
   they reviewed. The editor is allowed to agree, but editing does not count as
   agreement. Three distinct Discord IDs are required, not three clicks. Members
   can withdraw their own agreement before internal recording.
5. Any change to a score, explanation, selected issues or final feedback increments
   the whole-assessment revision. Previous agreements remain in history but no
   longer count. Concurrent stale edits and agreements are rejected. Editing the
   underlying idea also makes the assessment stale; revise it against the updated
   idea before new agreements or internal recording.
6. **Preview internal summary** shows the exact internal summary inside Discord. After three
   agreements, **Close and record internally** posts it only to the private Council review thread and freezes
   the assessment. Issues override the numerical recommendation. Internal recording is
   explicit; nothing is automatically posted at the third agreement.
7. **Reopen assessment** explicitly starts a new revision for further discussion,
   requiring three new agreements. A Resolved idea must itself be reopened first.

The existing In Proposal / Final Draft / Submitted / Reviewed / Resolved status
workflow stays separate. Closing an assessment does not change the idea status.
Status changes never bypass the assessment publication quorum. Reviewed exports
still contain the original idea (not the assessment); the private Council thread holds the
recorded assessment. There is no new Activity, OAuth setup or slash command.

A Council member uses this internal assessment as the basis for a separately written
response. This feature never posts ratings, reviewer agreements or assessment notes
to the public board, the author, or reviewed exports.

## Storage and safeguards

Migration `0004_shared_council_review.sql` adds shared drafts, revision-scoped
agreements and full-snapshot event history. Acknowledged Discord IDs and role lists
are checked server-side for each interaction. Read or write controls must originate
in the idea's private review thread. Native mutation requests are acknowledged
before database/Discord operations; opening a modal uses an immediate response.

Revision updates use compare-and-swap SQL, with mutation and event logging in one
D1 batch. Agreements are unique per idea, revision and actor. Events preserve the
whole draft, actor, reason and timestamp. An idea-content fingerprint prevents
publishing an assessment of old content. During reserved publication, content and
status edits are blocked until delivery is completed; use Retry internal recording if a
network failure left it reserved.

Publication uses a stable nonce and a durable message marker, scanning that thread
for a prior bot-authored result before retrying. This avoids reposting feedback if
Discord succeeded but database finalisation failed. The draft remains locked during
such failures. A maintainer can recover a persistently failed reserved publication
by fixing Discord permissions and retrying; do not reset it before checking for an
already-delivered message. Mentions in assessment output are suppressed.

Existing PR #1 tables/history are retained. On first native access, existing values
are imported into an **unagreed draft**; old per-item seconds never count as the new
three-person agreement. The previous web review page explains where reviewing moved,
and its mutation API returns 410 so it cannot publish via the obsolete rules.

## Deploy and refresh

First test this branch in staging with three real Council identities. Staging's
`everyone` Council sentinel is only for its test guild. Use a modern Node release
(Node 22.13+; Node 24 recommended) for tests that exercise production SQL through
Node's SQLite API. No runtime dependencies were added.

```bash
npm ci
npm run typecheck
npm test
npm run build:client
npx wrangler deploy --dry-run
```

After review, the maintainer verifies the correct Cloudflare account, applies
migration 0004 and deploys to staging, then production. Existing configured roles
and permissions should suffice; the bot needs Send Messages, Embed Links, Manage
Threads and Read Message History in the relevant forums. No new Discord portal
configuration or command registration is needed.

Refresh existing private posts with the dry-run-first helper (this does not touch
public messages or reactions):

```bash
node scripts/backfill-native-review.mjs
node scripts/backfill-native-review.mjs --apply
```

Staging uses `MUME_ENV_FILE=.dev.vars.staging` and `--staging`. This PR does not deploy
or execute the backfill. The native assessment button is also retained by content
and status refresh paths, so future edits do not remove it.

## Validation

Tests cover all 125 new-rubric score combinations, no-issue defaults, flag precedence,
input validation, three distinct agreements, repeated votes, withdrawals, stale
revisions/content, frozen publication, full event snapshots, and native role/guild
checks. SQLite tests execute the production D1 SQL through a transactional adapter;
real Discord interaction and deployed D1 acceptance are part of staging verification.
