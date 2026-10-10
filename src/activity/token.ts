// POST /api/token — exchange the Embedded App SDK `code` for identity and return
// a session token (build spec §6). Runs server-side so the client secret never
// touches the browser.

import type { Env } from "../types";
import { mintSession } from "../lib/session";

interface TokenExchange {
  access_token: string;
  token_type: string;
  scope: string;
}
interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleToken(env: Env, request: Request): Promise<Response> {
  let code: string | undefined;
  try {
    ({ code } = (await request.json()) as { code?: string });
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!code) return json({ error: "missing_code" }, 400);

  // Authorization code -> access token.
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_APP_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!tokenRes.ok) {
    console.error("oauth token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
    return json({ error: "exchange_failed" }, 401);
  }
  const token = (await tokenRes.json()) as TokenExchange;

  // Identify the user with their own access token.
  const userRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) return json({ error: "identify_failed" }, 401);
  const user = (await userRes.json()) as DiscordUser;
  const name = user.global_name || user.username;

  const session = await mintSession({ u: user.id, n: name, g: env.DISCORD_GUILD_ID }, env.SESSION_SIGNING_KEY);

  // access_token goes back so the client can call the SDK's authenticate().
  return json({ session, access_token: token.access_token, user: { id: user.id, name } });
}
