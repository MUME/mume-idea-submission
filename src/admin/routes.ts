// Admin CMS auth: Discord OAuth login, gated on the White Council role.

import type { Env } from "../types";
import { ADMIN_COOKIE, clearCookie, readCookie, sessionCookie, signToken, verifyToken } from "./session";
import type { AdminSession } from "./session";
import { holdsCouncil } from "../lib/council";
import { renderAdminPage } from "./page";

const SCOPE = "identify guilds.members.read";
const SESSION_TTL = 60 * 60 * 8; // 8 hours
const STATE_TTL = 600; // 10 minutes

const redirectUri = (env: Env) => `${env.PUBLIC_BASE_URL}/admin/callback`;

// The logged-in Council admin, if the cookie is valid.
export async function currentAdmin(env: Env, request: Request): Promise<AdminSession | null> {
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return null;
  return verifyToken<AdminSession>(token, env.SESSION_SIGNING_KEY);
}

function denyPage(message: string, status = 401): Response {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MUME admin</title>
<style>body{background:#1E1F22;color:#DBDEE1;font-family:'gg sans','Noto Sans',system-ui,sans-serif;
display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}
.box{max-width:440px;padding:32px}h1{color:#F2F3F5;font-size:20px}a{color:#5865F2}</style></head>
<body><div class="box"><h1>${message}</h1><p><a href="/admin">Try again</a></p></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Start the Discord OAuth flow, returning to `returnPath` after a successful login.
export async function beginLogin(env: Env, returnPath = "/admin"): Promise<Response> {
  const state = await signToken(
    { k: "state", r: returnPath, exp: Math.floor(Date.now() / 1000) + STATE_TTL },
    env.SESSION_SIGNING_KEY,
  );
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
}

// GET /admin — serve the CMS if logged in, else start the OAuth flow.
export async function handleAdminRoot(env: Env, request: Request): Promise<Response> {
  const admin = await currentAdmin(env, request);
  if (admin) {
    return new Response(renderAdminPage(), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return beginLogin(env, "/admin");
}

// GET /admin/callback — exchange the code, verify the Council role, set the cookie.
export async function handleAdminCallback(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return denyPage("Missing login parameters.");
  const st = await verifyToken<{ k?: string; r?: string; exp?: number }>(state, env.SESSION_SIGNING_KEY);
  if (!st || st.k !== "state") return denyPage("Login link expired. Start again.");
  // Only ever return to an in-app path, never an attacker-supplied absolute URL.
  const returnPath = st.r && st.r.startsWith("/admin") ? st.r : "/admin";

  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(env),
    }),
  });
  if (!tokenRes.ok) return denyPage("Discord login failed.");
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Read the caller's membership (roles) in the guild via their own token.
  const memberRes = await fetch(`https://discord.com/api/v10/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!memberRes.ok) return denyPage("Couldn't read your server membership.");
  const member = (await memberRes.json()) as { user?: { id: string }; roles?: string[] };
  const roles = member.roles ?? [];
  if (!holdsCouncil(env, roles)) {
    return denyPage("You need the White Council role to use this.", 403);
  }

  // Resolve a display name for attributing review proposals/seconds (identify scope).
  let name = "";
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${access_token}` } });
    if (meRes.ok) {
      const me = (await meRes.json()) as { username?: string; global_name?: string };
      name = me.global_name || me.username || "";
    }
  } catch {
    /* name is best-effort */
  }

  const session = await signToken(
    { u: member.user?.id ?? "", n: name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL },
    env.SESSION_SIGNING_KEY,
  );
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.PUBLIC_BASE_URL}${returnPath}`, "Set-Cookie": sessionCookie(session, SESSION_TTL) },
  });
}

// GET /admin/logout
export function handleAdminLogout(env: Env): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `${env.PUBLIC_BASE_URL}/admin`, "Set-Cookie": clearCookie() },
  });
}
