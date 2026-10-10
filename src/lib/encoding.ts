// Small encoding helpers. No dependencies — everything is WebCrypto / std.

const encoder = new TextEncoder();

// UTF-8 bytes with a guaranteed ArrayBuffer backing, so WebCrypto's strict
// BufferSource typing (TS 5.7+) accepts them directly.
export function utf8Bytes(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(s));
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("hex length must be even");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("invalid hex");
    out[i] = byte;
  }
  return out;
}

export function base64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64urlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64urlDecode(input));
}

// Constant-time comparison of two byte arrays.
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
