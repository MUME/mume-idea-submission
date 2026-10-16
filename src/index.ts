// MUME Idea Submission — Worker entry point (build spec §3).

import type { Env } from "./types";
import { KV } from "./constants";
import { assertValidConfig, loadConfigVersion, loadLiveConfig, saveConfig } from "./lib/config";
import { verifyInteractionSignature } from "./discord/verify";
import { handleInteraction } from "./discord/interactions";
import { handleToken } from "./activity/token";
import { handleSubmit } from "./activity/submit";
import { handleEditTarget } from "./activity/editTarget";
import { renderActivityPage } from "./activity/page";
import { createIdeaPost, addVoteReaction, autoFollow, postCouncilPing } from "./discord/forum";
import { attachThread, agingUnsubmittedIdeas, ideasMissingThread, logStatus } from "./lib/db";
import { handleAdminRoot, handleAdminCallback, handleAdminLogout, currentAdmin } from "./admin/routes";
import { handleReviewPage, handleReviewApi } from "./review/routes";
import { handleExport } from "./admin/export";
import appClientJs from "./generated/app.client.js";

const FRAME_ANCESTORS =
  "frame-ancestors https://discord.com https://discordapp.com https://*.discord.com https://*.discordsays.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Authorised via either the bearer ADMIN_TOKEN (CLI/seed) or a valid Council
// login cookie (the CMS).
async function requireAdmin(env: Env, request: Request): Promise<boolean> {
  const h = request.headers.get("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (token.length > 0 && constantTimeEqual(token, env.ADMIN_TOKEN)) return true;
  return (await currentAdmin(env, request)) !== null;
}

async function handleInteractions(env: Env, ctx: ExecutionContext, request: Request): Promise<Response> {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  const raw = await request.text(); // read once, verify, then parse
  const valid = await verifyInteractionSignature(env.DISCORD_PUBLIC_KEY, sig, ts, raw);
  if (!valid) return new Response(null, { status: 401 });
  const interaction = JSON.parse(raw);
  return handleInteraction(env, ctx, interaction);
}

async function serveActivity(env: Env): Promise<Response> {
  const config = await loadLiveConfig(env);
  return new Response(renderActivityPage(config, env.DISCORD_APP_ID), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": FRAME_ANCESTORS,
      "Cache-Control": "no-store",
    },
  });
}

function serveClientBundle(): Response {
  return new Response(appClientJs, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Content-Security-Policy": FRAME_ANCESTORS,
      "Cache-Control": "no-store",
    },
  });
}

async function handleAdminConfig(env: Env, request: Request): Promise<Response> {
  if (!(await requireAdmin(env, request))) return new Response(null, { status: 401 });

  if (request.method === "GET") {
    const raw = await env.CONFIG.get(KV.liveConfig);
    if (!raw) return json({ version: 0, config: null });
    const config = JSON.parse(raw);
    return json({ version: config.version, config });
  }

  if (request.method === "PUT") {
    let incoming: unknown;
    try {
      incoming = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    try {
      assertValidConfig(incoming);
    } catch (err) {
      return json({ error: "invalid_config", detail: (err as Error).message }, 422);
    }
    const saved = await saveConfig(env, incoming);
    return json({ ok: true, version: saved.version });
  }

  return new Response(null, { status: 405 });
}

async function handleHealth(env: Env): Promise<Response> {
  const raw = await env.CONFIG.get(KV.liveConfig);
  let version: number | null = null;
  if (raw) {
    try {
      version = JSON.parse(raw).version ?? null;
    } catch {
      version = null;
    }
  }
  return json({ ok: true, configVersion: version });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/interactions" && method === "POST") return handleInteractions(env, ctx, request);
    if (pathname === "/" && method === "GET") return serveActivity(env);
    if (pathname === "/app.js" && method === "GET") return serveClientBundle();
    if (pathname === "/api/config" && method === "GET") {
      try {
        return json(await loadLiveConfig(env));
      } catch {
        return json({ error: "not_seeded" }, 503);
      }
    }
    if (pathname === "/api/token" && method === "POST") return handleToken(env, request);
    if (pathname === "/api/edit-target" && method === "GET") return handleEditTarget(env, request);
    if (pathname === "/api/submit" && method === "POST") return handleSubmit(env, request);
    if (pathname === "/admin" && method === "GET") return handleAdminRoot(env, request);
    if (pathname === "/admin/callback" && method === "GET") return handleAdminCallback(env, request);
    if (pathname === "/admin/logout" && method === "GET") return handleAdminLogout(env);
    if (pathname === "/admin/export" && method === "GET") {
      if (!(await requireAdmin(env, request))) return new Response(null, { status: 401 });
      return handleExport(env, request);
    }
    if (pathname === "/admin/config") return handleAdminConfig(env, request);
    if (pathname === "/admin/review" && method === "GET") return handleReviewPage(env, request);
    if (pathname.startsWith("/admin/api/assess/")) return handleReviewApi(env, request);
    if (pathname === "/health") return handleHealth(env);

    return new Response("Not found", { status: 404 });
  },

  // Daily cron: retry any idea that committed but never got its forum post, and
  // send the one-time 30-day "still open" notice to the Council.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env));
  },
};

async function runCron(env: Env): Promise<void> {
  const pending = await ideasMissingThread(env);
  for (const idea of pending) {
    try {
      const stampedConfig = await loadConfigVersion(env, idea.schema_version);
      const { threadId, messageId } = await createIdeaPost(env, idea, stampedConfig);
      const now = Math.floor(Date.now() / 1000);
      await attachThread(env, idea.id, threadId, messageId, now);
      await addVoteReaction(env, threadId, messageId).catch(() => {});
      await logStatus(env, idea.id, null, "in_proposal", idea.author_id, idea.author_name, now);
      await autoFollow(env, threadId, idea.author_id).catch(() => {});
    } catch (e) {
      console.error(`cron retry failed for idea ${idea.id}`, e);
    }
  }

  await notifyAgingIdeas(env).catch((e) => console.error("30-day notice pass failed", e));
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// Once an unsubmitted idea (In Proposal / Final Draft) passes 30 days, drop a
// one-time "still open" nudge into its thread that pings the White Council. KV
// marks each idea so it never fires twice.
async function notifyAgingIdeas(env: Env): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_SECONDS;
  const ideas = await agingUnsubmittedIdeas(env, cutoff);
  for (const idea of ideas) {
    if (!idea.thread_id) continue;
    const key = KV.aged30(idea.id);
    if (await env.CONFIG.get(key)) continue; // already notified
    try {
      await postCouncilPing(env, idea.thread_id, "⏰ This idea is now 30 days old —");
      await env.CONFIG.put(key, "1");
    } catch (e) {
      console.error(`30-day notice failed for idea ${idea.id}`, e);
    }
  }
}
