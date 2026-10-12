# Council assessment in Discord

This replaces the per-item propose/second workflow from PR #1 with a fluid shared
assessment, one second on the complete selected checks, and three agreements on
the final scores.

## Review flow

1. In the private submitted-ideas forum, click **Assess idea**. A Council-only
   ephemeral panel opens inside Discord. Panels are personal snapshots of a shared
   D1 draft; use **Refresh** to see others' changes.
2. **Issues requiring action** is a multi-select dropdown. Pick one or more issues
   and explain them in the modal. None selected means pass by default, with no second.
   Another Council member clicks **Second** once to endorse the
   entire selection and its explanation. A member cannot second their own selection.
   The seconder can withdraw their second; changing the selection or explanation
   clears the second and attributes the new selection to the editor.
3. **Adjust scores / feedback** opens a five-field form: three scores (`4 | reason`,
   for example), an internal note / response guidance, and the reason for the edit.
   Scores remain fluid during discussion. Usefulness ×1, Feasibility ×2 (effort only),
   Interest ×1 produces 4–20 and the existing recommendation bands.
4. **Agree with final scores** is a separate step. Three distinct Council members
   explicitly agree to the complete set of scores and their reasons. The editor
   can be one of the three, but editing does not count as agreement. Members can
   withdraw their own score agreement. No voting on incomplete scores.
5. Approval scopes are independent. Score/reason changes reset only score agreements.
   Check selection/explanation changes reset only the checks second. An internal-note
   edit resets neither: that note is working material, not part of the score vote.
   All changes are audited. Underlying idea changes invalidate both approval scopes;
   revise against its new content before new approvals or internal recording.
6. **Preview internal summary** shows what will be recorded. When no issues are
   selected, **Close and record internally** requires all scores and three score
   agreements. When issues are selected, the complete check selection needs one
   second; that return/defer outcome overrides scores and can be recorded before
   completing them. It does not label unfinished scores as agreed.
7. Closing posts the assessment only to the private Council thread and freezes it.
   A Council member uses it as the basis for a separately written response. Nothing
   reaches the public board, author or reviewed exports through this feature.
8. **Reopen assessment** explicitly restarts both approval scopes: checks need a
   fresh second if selected, and scores need three fresh agreements. A Resolved
   idea must first be reopened using the status dropdown.

The existing In Proposal / Final Draft / Submitted / Reviewed / Resolved status
workflow stays separate. Closing an assessment does not change the idea status.
**Marking an idea Reviewed is blocked until three Council members have agreed to
its current complete scores.** The Discord dropdown explains why a premature
attempt is rejected, and the database update checks the same condition atomically.
A changed idea, revised scores or withdrawn agreement cannot bypass this gate.
A checks second alone allows an internal return/defer record, but does not permit
marking the idea Reviewed without the three final-score agreements. Reviewed exports
still contain the original idea (not the assessment); the private Council thread holds the
recorded assessment. There is no new Activity, OAuth setup or slash command.

A Council member uses this internal assessment as the basis for a separately written
response. This feature never posts ratings, reviewer agreements or assessment notes
to the public board, the author, or reviewed exports.

## Storage and safeguards

Migration 0004 adds shared drafts and event history. Migration
`0005_separate_checks_and_scores.sql` adds independent score/check revisions,
checks proposer/seconder attribution and a separate score-agreement table. Existing
whole-assessment agreement rows/history are retained but do not automatically count
as final-score votes under the revised model. Acknowledged Discord IDs and role lists
are checked server-side for each interaction. Read or write controls must originate
in the idea's private review thread. Native mutation requests are acknowledged
before database/Discord operations; opening a modal uses an immediate response.

Revision updates use compare-and-swap SQL, with mutation and event logging in one
D1 batch. Score agreements are unique per idea, score revision and actor. Checks seconds are
atomic, require a different member, and cover one complete check revision. Events preserve the
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
migrations 0004 and 0005 and deploys to staging, then production. Existing configured roles
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
input validation, three distinct score agreements, whole-selection checks seconding, independent
approval invalidation, repeated votes, withdrawals, stale
revisions/content, frozen publication, full event snapshots, and native role/guild
checks. SQLite tests execute the production D1 SQL through a transactional adapter;
real Discord interaction and deployed D1 acceptance are part of staging verification.
