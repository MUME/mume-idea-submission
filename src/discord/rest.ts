// Thin Discord REST client with bot auth, 429 handling and 5xx retry (spec §12).

import type { Env } from "../types";
import { DISCORD_API } from "../constants";

export class DiscordRestError extends Error {
  constructor(
    public status: number,
    public body: string,
    public route: string,
  ) {
    super(`Discord ${route} -> ${status}: ${body.slice(0, 300)}`);
    this.name = "DiscordRestError";
  }
}

interface CallOptions {
  method?: string;
  body?: unknown;
  // Total attempts for retryable failures (5xx / 429). Default 3.
  attempts?: number;
  // Webhook routes (e.g. editing @original) authenticate via the token in the
  // URL and need no bot Authorization header.
  unauthenticated?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discordFetch(
  env: Env,
  route: string,
  { method = "GET", body, attempts = 3, unauthenticated = false }: CallOptions = {},
): Promise<Response> {
  const url = route.startsWith("http") ? route : `${DISCORD_API}${route}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!unauthenticated) headers.Authorization = `Bot ${env.DISCORD_BOT_TOKEN}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let lastErr: DiscordRestError | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    if (res.status === 429) {
      // Respect retry_after; retry once regardless of the loop budget.
      const data = (await res.clone().json().catch(() => null)) as { retry_after?: number } | null;
      const wait = Math.min(5000, Math.ceil((data?.retry_after ?? 1) * 1000));
      if (attempt < attempts) {
        await sleep(wait);
        continue;
      }
    }

    if (res.status >= 500 && attempt < attempts) {
      await sleep(250 * attempt); // linear backoff
      continue;
    }

    lastErr = new DiscordRestError(res.status, await res.text().catch(() => ""), route);
    break;
  }
  throw lastErr ?? new DiscordRestError(0, "unknown", route);
}

export async function discordJson<T>(env: Env, route: string, opts?: CallOptions): Promise<T> {
  const res = await discordFetch(env, route, opts);
  return (await res.json()) as T;
}
