# Running a staging copy

A **staging** instance is a second, independent copy of MUME Idea Submission that runs
at the same time as the live one — a safe place to try new questions or changes before
they reach the real server. It has its own URL, its own database, its own secrets, and
its own Discord app, so it can never disturb the live instance.

The code is identical; only the *configuration* differs. `wrangler deploy` still deploys
the live instance; `wrangler deploy --env staging` deploys this copy.

> **Why a second Discord app?** A Discord application can point at only one endpoint and
> one Activity URL, so the staging Worker needs its own app. Make a second one — it's
> the only "duplicate" you truly need.

Run everything below from the project folder.

## 1. Create the staging Discord app
- Dev portal → **New Application** → e.g. "MUME Idea Submission (Staging)".
- Add a **Bot**, copy its **Token**. From **General Information** copy the **Application ID**
  and **Public Key**; from **OAuth2** copy the **Client Secret**.
- Invite the bot to your staging server (a spare server, or the same one with *separate*
  channels — never point two bots at the same channel).

## 2. Create the staging Cloudflare resources
```bash
npx wrangler d1 create mume_ideas_staging
npx wrangler kv namespace create CONFIG-staging
```
Paste the two ids into `wrangler.toml` under `[env.staging]` (the `REPLACE_WITH_…` lines).

## 3. Fill in the staging values
- Copy `.dev.vars.staging.example` → `.dev.vars.staging` and fill every field with the
  **staging** app + server values. Generate fresh `SESSION_SIGNING_KEY` and `ADMIN_TOKEN`
  with `openssl rand -hex 32` (don't reuse the live ones).
- Confirm `PUBLIC_BASE_URL` matches in both `.dev.vars.staging` **and**
  `wrangler.toml` → `[env.staging.vars]` (it's `…-staging.<your-subdomain>.workers.dev`).

## 4. Migrate, deploy, set secrets
```bash
npm run db:migrate:staging
npm run deploy:staging
MUME_ENV_FILE=.dev.vars.staging node scripts/set-secrets.mjs --env staging
npm run deploy:staging      # redeploy so it picks up the secrets
```

## 5. Seed the form + register commands (against staging)
```bash
MUME_ENV_FILE=.dev.vars.staging npm run seed -- https://mume-idea-submission-staging.<your-subdomain>.workers.dev
MUME_ENV_FILE=.dev.vars.staging npm run register
```

## 6. Create the staging channels (optional helpers)
```bash
MUME_ENV_FILE=.dev.vars.staging node scripts/create-submit-channel.mjs
MUME_ENV_FILE=.dev.vars.staging node scripts/create-export-channel.mjs
```
Also create the ideas **forum** channel by hand (its tags auto-create), and put its id
into `.dev.vars.staging` as `FORUM_CHANNEL_ID`, then re-run set-secrets + deploy:staging.

## 7. Portal setup for the STAGING app
On the staging Discord app (same steps as the live one, but the staging URL):
- **Interactions Endpoint URL** → `…-staging.workers.dev/interactions`
- **OAuth2 → Redirects** → add `…-staging.workers.dev/` and `…-staging.workers.dev/admin/callback`
- **Activities** → enable, URL mapping root → the staging URL, tick **Web + iOS + Android**
- **Bot → Privileged Gateway Intents** → enable **Server Members Intent**

## 8. Finish
Run `/idea-setup` in the staging server. Done — the staging copy is live alongside the
real one, at its own URL, with its own data.

---

### Day-to-day
- Deploy a change to staging only: `npm run deploy:staging`
- Deploy to live: `npm run deploy`
- Edit staging's questions: its own admin page at `…-staging.workers.dev/admin`
