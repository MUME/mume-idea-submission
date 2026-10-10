# Council idea review (assessment)

An off-site, Council-only surface for scoring and triaging submitted ideas. It is
built **into this same Worker and D1** (not a separate service), so it reads ideas
directly and posts results back to Discord. It is the production version of the
rubric prototype; the logic (gate checks, weighted scoring, two-person seconding)
is kept, the surface is a proper web page rather than a Discord dialog.

## What it does

For a submitted idea, the Council assesses it against a fixed rubric:

- **Six gate checks** (clarity, evidence, split, already-exists, duplicate,
  dependency). A seconded **yes** on any check returns the idea to the author with
  standard guidance and sets the score aside.
- **Three scores**: Usefulness (×1), Feasibility (×2, effort only), Interest (×1),
  giving a total of 4–20 mapped to five recommendation bands.
- **Propose then second**: every check and score is proposed by one Council member
  and must be seconded by a **different** one. Revising clears the second.
- A live **Author feedback** card builds the message that will go to the author.
  Nothing reaches Discord until a Council member clicks **Publish**.

The rubric is the single source of truth in [`src/lib/rubric.ts`](src/lib/rubric.ts)
and all authority is enforced server-side — the client only renders. `RUBRIC_VERSION`
is stamped on each assessment so results stay readable if the rubric changes.

## Reviewer flow

1. An idea reaches **Submitted**; the bot mirrors a private review copy (existing
   behaviour). That copy now carries an **"Assess idea"** link button.
2. The button opens `/{PUBLIC_BASE_URL}/admin/review?idea=N`. First visit signs the
   reviewer in with Discord (same White-Council login as the admin CMS) and returns
   to the page.
3. Reviewers propose and second each check and score. The result resolves live.
4. **Publish** posts the agreed feedback to the idea's review thread. It does **not**
   change the idea's status — the Council still does that with the existing status
   dropdown (deliberate; outcomes are presented, not auto-applied).

## Architecture

| Piece | File |
|---|---|
| Rubric + result (pure, tested) | `src/lib/rubric.ts` |
| Persistence + mutation rules | `src/lib/assess.ts` |
| API + page handlers | `src/review/routes.ts` |
| The SPA | `src/review/page.ts` |
| Schema | `migrations/0003_assessments.sql` |
| "Assess idea" button on review copies | `src/discord/forum.ts` |
| Reviewer name in the session | `src/admin/{session,routes}.ts` |
| Engine tests | `test/logic.test.mjs` |

**Auth**: reuses the admin Discord OAuth. The review area lives under `/admin`, so
the existing `/admin/callback` redirect (already registered in the Discord portal)
covers it — **no new portal step and no new secrets**. The session now also carries
the reviewer's display name, for attributing proposals and seconds.

**Routes**:
- `GET /admin/review?idea=N` — the page (login-gated).
- `GET /admin/api/assess/:id` — idea + rubric + current assessment + result.
- `POST /admin/api/assess/:id/propose` — `{item_id, value, reason}`.
- `POST /admin/api/assess/:id/second` — `{item_id, revision}`.
- `POST /admin/api/assess/:id/publish` — `{note}`; posts to the review thread.

**Tables** (migration 0003): `assessments` (one per idea), `assessment_items`
(one current proposal per item, with proposer/seconder/revision), `assessment_log`
(append-only history). Derived totals and bands are never stored; they are computed
from the agreed items on every read.

**Integrity**: proposer and seconder must be distinct Discord IDs; a second carries
the revision it saw and is rejected if the wording changed since; validation and the
outcome are server-side only.

## Deploy (not done automatically)

Publishing to the live bot is a manual step on the White Council Cloudflare account.
Before running, confirm the account:

```bash
npx wrangler whoami   # expect themumewhitecouncil@gmail.com (4b7c51dd…)
```

Then apply the migration and deploy:

```bash
npx wrangler d1 migrations apply mume_ideas --remote   # adds the 3 assessment tables
npm run deploy
```

After deploy, the "Assess idea" button appears on review copies the next time each
one is rendered (any status change refreshes it; existing copies can be nudged by a
status change, or re-mirrored on the next submit).

No new secrets. Staging: the same two commands with the `:staging` / `--env staging`
variants (see `STAGING.md`), on the staging Cloudflare account.

## Not in this version (by design, agreed)

- Publishing does **not** change the idea's status; the Council selects the outcome.
- No automatic return/reopen wiring; the gate-check actions are shown as guidance.
- One assessment per idea; reopening/revising the whole assessment after publish is
  a later addition if wanted.
