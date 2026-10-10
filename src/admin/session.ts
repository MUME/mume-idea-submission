// Signed tokens + cookie helpers for the admin CMS. Same HMAC scheme as the
// Activity session, keyed by SESSION_SIGNING_KEY.

import {
  base64urlDecode,
  base64urlDecodeToString,
  base64urlEncode,
  timingSafeEqual,
  utf8Bytes,
} from "../lib/encoding";

export interface AdminSession {
  u: string; // discord user id (Council-verified at login)
  exp: number;
}

export const ADMIN_COOKIE = "mume_admin";

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8Bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, utf8Bytes(payload));
  return base64urlEncode(new Uint8Array(sig));
}

export async function signToken(obj: object, secret: string): Promise<string> {
  const payload = base64urlEncode(JSON.stringify(obj));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyToken<T extends { exp?: number }>(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<T | null> {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = await sign(payload, secret);
  if (!timingSafeEqual(base64urlDecode(provided), base64urlDecode(expected))) return null;
  let obj: T;
  try {
    obj = JSON.parse(base64urlDecodeToString(payload)) as T;
  } catch {
    return null;
  }
  if (typeof obj.exp === "number" && obj.exp < nowSeconds) return null;
  return obj;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=${maxAgeSeconds}`;
}

export function clearCookie(): string {
  return `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0`;
}
