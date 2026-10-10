// Activity session token (build spec §6).
//
//   payload  = base64url(JSON.stringify({ u, n, g, exp }))
//   session  = payload + "." + base64url(HMAC-SHA256(payload, SESSION_SIGNING_KEY))
//
// It proves identity, nothing more. It is reusable within its window so a form
// rejected for a missing field can be re-sent from the same open page.

import type { Session } from "../types";
import { base64urlEncode, base64urlDecodeToString, base64urlDecode, timingSafeEqual, utf8Bytes } from "./encoding";

const SESSION_TTL_SECONDS = 1800; // 30 minutes

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8Bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, utf8Bytes(payload));
  return base64urlEncode(new Uint8Array(sig));
}

export async function mintSession(
  fields: Omit<Session, "exp">,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const session: Session = { ...fields, exp: nowSeconds + SESSION_TTL_SECONDS };
  const payload = base64urlEncode(JSON.stringify(session));
  const sig = await sign(payload, secret);
  return `${payload}.${sig}`;
}

// Returns the Session if the signature verifies and it has not expired, else null.
export async function verifySession(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<Session | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  const expected = await sign(payload, secret);
  if (!timingSafeEqual(base64urlDecode(provided), base64urlDecode(expected))) return null;

  let session: Session;
  try {
    session = JSON.parse(base64urlDecodeToString(payload));
  } catch {
    return null;
  }
  if (typeof session.exp !== "number" || session.exp < nowSeconds) return null;
  if (!session.u || !session.g) return null;
  return session;
}
