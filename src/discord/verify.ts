// Ed25519 interaction signature verification (build spec §7).
// Read the raw body once as text, verify, then parse. Never parse first.

import { hexToBytes, utf8Bytes } from "../lib/encoding";

export async function verifyInteractionSignature(
  publicKey: string,
  signature: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  let key: CryptoKey;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    sigBytes = hexToBytes(signature);
  } catch {
    return false;
  }
  return crypto.subtle.verify(
    "Ed25519",
    key,
    sigBytes,
    utf8Bytes(timestamp + rawBody),
  );
}
