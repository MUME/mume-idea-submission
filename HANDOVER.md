# MUME Idea Submission Bot — Handover & Operations Guide

_Last updated: 2026-09-21_

This document is a complete handover for the **MUME Idea Submission** Discord bot:
what it is, where every piece lives, how it works end-to-end, and everything a new
maintainer needs to run it without prior context.

---

## 1. What it is (one paragraph)

A **Cloudflare Worker** (serverless, no always-on server) that turns a member's
submitted idea into a **forum post** on the MUME Discord, then walks that idea
through a review lifecycle (In Proposal → Final Draft → Submitted → Reviewed →
Resolved) driven by the **White Council** role. Members submit through a
**Discord Activity** (an in-Discord iframe form). Data lives in a Cloudflare **D1**
database (SQLite) and **KV** store; Discord is only the display/interaction layer.
There is a web **admin CMS** for editing the form, and a daily **cron** for
housekeeping. No code changes are needed for day-to-day operation.

---

## 2. Handover checklist — what a new owner needs

To take full ownership you need access to **three** accounts. Nothing else.

| # | Thing to get | Why | How |
|---|---|---|---|
| 1 | **Cloudflare account** `themumewhitecouncil@gmail.com` (acct id `4b7c51dd6eabcae2b86fbec9310ff647`) | Hosts the Worker, D1 and KV | Get the login, or be added as a member of that Cloudflare account |
| 2 | **Discord Developer Portal** app `1526294757733695619` ("Idea Board") | Owns the bot user, slash commands, OAuth + Activity config | Transfer the app to a team, or share the owning Discord account |
| 3 | **The 6 secrets** (bot token, keys — see §8) | Needed to deploy/rotate | Copy the values from the current `.dev.vars`, or re-generate (§8) |
| 4 | This repo (the code) + `.dev.vars` | To deploy and run scripts | See §9; `.dev.vars` is **not** in git (it holds secrets) — copy it separately |

Once you have those, `npm install` and `npm run deploy` (from the right Cloudflare
login) is all it takes to ship a change. If you never change anything, **it keeps
running on its own** — the Worker and cron need no babysitting.

---

## 3. Where it sits (infrastructure inventory)

### Cloudflare (account `themumewhitecouncil@gmail.com` / `4b7c51dd…`)
| Resource | Name / ID | Notes |
|---|---|---|
| Worker | `mume-idea-submission` | The whole app |
| Worker URL | `https://mume-idea-submission.mume-idea-submission.workers.dev` | Public base (`PUBLIC_BASE_URL`) |
| D1 database | `mume_ideas` — `20a1d96f-2c21-40f3-b753-cb9d7b55f0d8` | Tables: **`ideas`**, `status_log` (see §7) |
| KV namespace | `CONFIG` — `dbabc2f4fe4f483faf939242d1f404a2` | Form config + one-time flags |
| Cron trigger | `0 12 * * *` (daily, 12:00 UTC) | Housekeeping (§4.6) |

> ⚠️ **Cloudflare login gotcha:** the `wrangler` CLI has **one global login** shared
> by every terminal. It has a habit of reverting to the old `adhoc-media` account.
> **Always run `wrangler whoami` before any `deploy` or `d1` command** and confirm it
> says `themumewhitecouncil@gmail.com`. If not: `wrangler login` and pick that account.

### Discord (server **MUME**, guild `497457567392333824`)
| Resource | ID | Purpose |
|---|---|---|
| Application ("Idea Board") | `1526294757733695619` | The bot + Activity + commands |
| `#ideas` (forum) | `1019822002586005544` | **Public** idea posts (`FORUM_CHANNEL_ID`) |
| `#submit-an-idea` (text) | `1538742079205679113` | Holds the "Submit an idea" button (`SUBMIT_CHANNEL_ID`) |
| `#submitted-ideas` (forum) | `1538742374799380510` | **Private** review copies for the Council (`SUBMITTED_CHANNEL_ID`) |
| `#reviewed-ideas` (text) | `1538742288015032500` | Auto-posted export of reviewed ideas (`EXPORT_CHANNEL_ID`) |
| `@White Council` role | `1538661236852391976` | The reviewers — controls status (`COUNCIL_ROLE_ID`) |

---

## 4. How it works (end to end)

### 4.1 Submitting an idea
- A member clicks **Submit an idea** (a button in `#submit-an-idea`) or runs **`/idea`**.
- The bot responds by launching a **Discord Activity** — an iframe form served by the
  Worker, opened inside Discord. It's a two-page form (title, proposal, and
  radio/checkbox category questions). Dark theme only.
- Identity is proven by the **Discord Embedded App SDK OAuth handshake** (the Activity
  authorizes, exchanges a code at `/api/token`, and gets a signed session token). The
  author is **never** taken from the request body — it's cryptographically tied to the
  logged-in Discord user.
- On submit, the Worker writes the idea to D1 and posts a **forum thread in `#ideas`**:
  a rich embed of the answers, a **status dropdown**, an **Edit idea** button, and two
  seeded reactions **👍 / 👎** (a simple vote — members can only click the pre-placed
  emoji because "Add Reactions" is denied on the forum).

### 4.2 The status lifecycle
Only the **White Council** can change status (via the dropdown on the post). Stages:

| Dot | Status | Meaning |
|---|---|---|
| ⚪ | **In Proposal** | Open for discussion and rewrites |
| 🟡 | **Final Draft** | Author considers it settled |
| 🔵 | **Submitted** | In the review queue for debate |
| 🟢 | **Reviewed** | Reviewed — exported to `#reviewed-ideas` |
| 🟣 | **Resolved** | Closed — thread locked, no further changes |

Statuses are **not** one-way: the Council can walk an idea back a stage at any time
(e.g. Reviewed → Submitted). **Resolved** is the only hard lock.

### 4.3 The review pipeline (the important bit)
The **first** time an idea reaches **Submitted**:
- The bot **mirrors a working copy** into the private **`#submitted-ideas`** forum — this
  is where the Council does the actual review, with the live controls.
- The **public `#ideas` post becomes a read-only record** (its controls are stripped).
- The public post's community reactions are copied over as the **first comment** in the
  review thread (the bot's own seeded 👍/👎 are subtracted, so only real votes show).

From then on, **status changes and content edits sync both copies** automatically.

### 4.4 Editing an idea
- **`/idea-edit number:<N>`** — reopens the full Activity form, pre-filled, for the author
  or the Council. Best run from a normal text channel (Activities don't launch from a
  forum thread).
- **"Edit idea" button** on any post — opens a native Discord modal for the **text**
  fields (title/proposal/etc.). Works inside forum threads where the Activity can't.
  (The dropdown/checkbox answers can only be changed via the full `/idea-edit` form.)

### 4.5 Reviewed → export
When an idea is set to **Reviewed**, the bot auto-posts to **`#reviewed-ideas`**: the
readable embed **plus** a Word-openable **`.rtf`** document of the full idea
(`idea-<N>-reviewed.rtf`). The admin CMS can also export **CSV** on demand (§6).

### 4.6 The daily cron (12:00 UTC)
Two housekeeping passes, both safe/idempotent:
1. **Retry missing posts** — if an idea committed to D1 but its forum post failed, it's
   created on the next run.
2. **30-day "still open" notice** — an unsubmitted idea (In Proposal / Final Draft) that
   passes 30 days gets a one-time `@White Council` nudge in its thread. (KV-guarded so it
   never repeats.)

---

## 5. Discord commands

| Command | Who | What |
|---|---|---|
| **`/idea`** | anyone | Launch the submission Activity |
| **Submit an idea** (button) | anyone | Same as `/idea`, from `#submit-an-idea` |
| **`/idea-edit number:<N>`** | author or Council | Re-open the form to edit idea N |
| **`/idea-delete number:<N>`** | Council | Delete an idea + its post(s) |
| **`/idea-setup`** | Council/admin | (Re)post the "Submit an idea" button in `#submit-an-idea` |

Commands are registered with `npm run register` (see §6). If a command ever disappears
or you change its definition, re-run that.

---

## 6. Operating it (common tasks)

All commands run from the repo directory, on the **white-council** Cloudflare login.

```bash
# Always check the login first:
wrangler whoami            # must say themumewhitecouncil@gmail.com

# Ship a change:
npm run deploy             # builds the Activity client + deploys the Worker

# Edit the submission form (non-technical): use the web CMS instead —
#   https://mume-idea-submission.mume-idea-submission.workers.dev/admin
#   (log in with Discord; you must hold the White Council role)

# (Re)register slash commands after changing them:
npm run register

# Re-post the "Submit an idea" button:  run /idea-setup in Discord

# Inspect the data:
wrangler d1 execute mume_ideas --remote --command "SELECT id, status, title FROM ideas ORDER BY id"

# Rotate/set secrets from .dev.vars (see §8):
npm run secrets

# Apply a new DB migration (rare — only when the schema changes):
npm run db:migrate:remote
```

**The form is edited through the CMS, not the code.** `/admin` is a visual editor for the
questions, options, help text, limits and embed fields. It's gated on the White Council
role via Discord OAuth. This is the main thing a non-technical maintainer will touch.

---

## 7. Data model

**D1 database `mume_ideas`** (note: the database is *named* `mume_ideas` but the **table**
inside it is **`ideas`**):

- **`ideas`** — one row per idea: `id`, `author_id`/`author_name`, `title`, `status`,
  `answers` (JSON), `thread_id`/`message_id` (public post), `review_thread_id`/
  `review_message_id` (review copy), `schema_version`, `created_at`/`updated_at`.
- **`status_log`** — an append-only audit of every status change
  (`idea_id`, `from_status`, `to_status`, `actor`, `created_at`).

**KV namespace `CONFIG`** holds:
- `form:config` + `form:config:v<N>` — the current + versioned form definitions (each idea
  stamps the version it was submitted under, so old ideas render correctly).
- `forum:tags`, `pinned:submit` — cached Discord ids.
- `edit:<userId>` — short-lived edit intents.
- `aged30:<ideaId>` — one-time flag for the 30-day notice.

Current scale (for reference): **17 ideas** in the DB.

---

## 8. Secrets

Set via `wrangler secret put` (or `npm run secrets`, which pushes them all from
`.dev.vars`). **These are the only credentials — keep `.dev.vars` private, it is
git-ignored.** Names only (values are in `.dev.vars`):

| Secret | What it is | Rotate at |
|---|---|---|
| `DISCORD_BOT_TOKEN` | The bot user's token | Discord Dev Portal → Bot |
| `DISCORD_PUBLIC_KEY` | Verifies interaction signatures | Dev Portal → General |
| `DISCORD_CLIENT_SECRET` | OAuth (Activity + admin login) | Dev Portal → OAuth2 |
| `SESSION_SIGNING_KEY` | Signs Activity/admin session cookies | any random 32+ byte string |
| `ADMIN_TOKEN` | Bearer token for the admin API | any random string |
| _(non-secret ids)_ | app/guild/channel/role ids | in `.dev.vars` + §3 |

If the bot token or client secret ever leaks, regenerate it in the Discord Developer
Portal, update `.dev.vars`, run `npm run secrets`, and `npm run deploy`.

---

## 9. Codebase layout

```
mume-idea-submission/
  wrangler.toml            # Cloudflare config: Worker name, D1/KV bindings, cron, staging
  package.json             # npm scripts (§6)
  .dev.vars                # secrets + ids (NOT in git — copy separately)
  migrations/              # D1 schema (0001_init, 0002_review_copy)
  src/
    index.ts               # entry: HTTP router + the daily cron
    constants.ts           # statuses, colours, KV keys, Discord constants
    types.ts
    discord/               # interactions, forum ops, embeds, REST, signature verify
    activity/              # the in-Discord submission form (iframe page + token + submit)
    admin/                 # the /admin CMS (routes, session, page, export)
    lib/                   # db, config, validate, transitions, csv, worddoc, session
    generated/             # built Activity client bundle (git-ignored)
  scripts/                 # ops: register-commands, seed-config, set-secrets, channel setup…
  test/                    # node --test unit tests (run: npm test)
  README.md                # original build/deploy checklist
  HANDOVER.md              # this file
```

TypeScript, no framework, zero Worker runtime dependencies. `npm test` runs the unit
tests; `npm run typecheck` type-checks.

---

## 10. Staging (optional, for testing changes safely)

A **second, independent copy** exists for testing without touching production:
- Worker `mume-idea-submission-staging`, its **own** Discord app, D1 (`mume_ideas_staging`)
  and KV. Deploy with `npm run deploy:staging`.
- **It lives on the OLD Cloudflare account** (`adhoc-media`), so you must
  `wrangler login` to that account to deploy it. See `STAGING.md`.
- In staging, `COUNCIL_ROLE_ID=everyone` makes everyone a "Council" member so anyone can
  exercise the review controls.

You can ignore staging entirely for normal operation — production does not depend on it.

---

## 11. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| A deploy or `d1` command hits the wrong account | `wrangler whoami`; re-`wrangler login` to `themumewhitecouncil@gmail.com` |
| Slash command missing in Discord | `npm run register` |
| "Submit an idea" button gone | run `/idea-setup` in Discord |
| Idea submitted but no forum post | the cron retries within 24h; check Worker logs (`wrangler tail`) |
| Interactions failing after a redeploy | confirm the **Interactions Endpoint URL** in the Dev Portal is `…workers.dev/interactions` |
| Admin login rejected | you must hold the **White Council** role; OAuth redirect `…/admin/callback` must be registered in the Dev Portal |
| Status tag chips missing on posts | cosmetic — the bot may lack Manage Channels on the forum; status still shows in the embed badge |

Live logs: `wrangler tail` (on the white-council login).

---

## 12. Taking ownership (the actual handover)

1. **Cloudflare** — add the new maintainer to the `themumewhitecouncil` Cloudflare
   account (Members → Invite), or hand over the login. That gives them the Worker, D1
   and KV.
2. **Discord app** — in the Developer Portal, move app `1526294757733695619` into a
   **Team** and add the new maintainer, so bot-token/OAuth control isn't tied to one
   personal account.
3. **Code + secrets** — give them this repo and a copy of `.dev.vars`. Confirm they can
   run `wrangler whoami` → `npm run deploy` successfully once.
4. Point them at this file. After that, **nothing needs active management** — the Worker
   and cron run themselves; the CMS covers form edits; the Council runs the lifecycle
   from inside Discord.
