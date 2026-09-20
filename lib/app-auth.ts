export const APP_SESSION_COOKIE = "cadence_app_session";
export const APP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createAppSession(
  secret: string,
  ttlMs = APP_SESSION_TTL_MS,
  now = Date.now(),
): Promise<string> {
  if (!secret) throw new Error("APP_ACCESS_SECRET is required");
  const expires = String(now + ttlMs);
  const payload = `v1.${expires}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyAppSession(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const [version, expiresText, encodedSignature, extra] = token.split(".");
  if (version !== "v1" || extra !== undefined || !/^\d+$/.test(expiresText ?? "")) return false;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= now) return false;
  const signature = fromBase64Url(encodedSignature ?? "");
  if (!signature) return false;
  const signatureBuffer = new Uint8Array(signature).buffer;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signatureBuffer,
    encoder.encode(`${version}.${expiresText}`),
  );
}
