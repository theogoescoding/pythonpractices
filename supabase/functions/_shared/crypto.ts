// Keyed hashes, code encryption, session tokens and random digits.
// The three keys come from Edge Function secrets (docs/SECRETS.md): each is 32 random bytes, base64.
//   LOOKUP_KEY   HMAC-SHA256 for login_lookup, code_hash and rate-limit keys (each with its own prefix)
//   CODE_KEY     AES-256-GCM for login_code_enc
//   SESSION_KEY  HMAC-SHA256 that signs student session tokens

import bcrypt from "npm:bcryptjs@2.4.3";

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const keys = new Map<string, Promise<CryptoKey>>();
function key(name: "LOOKUP_KEY" | "CODE_KEY" | "SESSION_KEY"): Promise<CryptoKey> {
  if (!keys.has(name)) {
    const raw = Deno.env.get(name);
    if (!raw) throw new Error(name + " is not set");
    const bytes = unb64(raw.trim());
    if (bytes.length < 32) throw new Error(name + " must be at least 32 bytes");
    keys.set(name, name === "CODE_KEY"
      ? crypto.subtle.importKey("raw", bytes.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"])
      : crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
  }
  return keys.get(name)!;
}

// HMAC-SHA256 with LOOKUP_KEY. The prefix keeps the uses apart, so a login lookup can never equal a code hash.
export type LookupUse = "login" | "code" | "ip";
export async function lookupHash(use: LookupUse, value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", await key("LOOKUP_KEY"), enc.encode(use + ":" + value))));
}

// AES-256-GCM, stored as "v1.<iv>.<ciphertext>" in base64.
export async function encryptCode(code: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key("CODE_KEY"), enc.encode(code)));
  return "v1." + b64(iv) + "." + b64(ct);
}
export async function decryptCode(stored: string): Promise<string> {
  const [v, iv, ct] = stored.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("unknown code format");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key("CODE_KEY"), unb64(ct)));
}

// ---------- Session tokens ----------
// <base64url JSON { sid, exp }>.<base64url HMAC-SHA256 of the first part>. exp is in seconds since 1970.
export const SESSION_HOURS = 8;

export async function signToken(studentId: string): Promise<{ token: string; expires_at: string }> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  const payload = b64url(enc.encode(JSON.stringify({ sid: studentId, exp })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key("SESSION_KEY"), enc.encode(payload)));
  return { token: payload + "." + b64url(sig), expires_at: new Date(exp * 1000).toISOString() };
}

// The student id in a valid, unexpired token, or null. The signature check takes the same time whatever it holds.
export async function verifyToken(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || token.length > 1000) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key("SESSION_KEY"), unb64url(parts[1]), enc.encode(parts[0]));
    if (!ok) return null;
    const { sid, exp } = JSON.parse(dec.decode(unb64url(parts[0])));
    if (typeof sid !== "string" || typeof exp !== "number" || exp * 1000 <= Date.now()) return null;
    return sid;
  } catch {
    return null;
  }
}

// ---------- Codes and PINs ----------
// n random digits, without bias (bytes of 250 or more are drawn again).
export function randomDigits(n: number): string {
  let out = "";
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n))) if (b < 250 && out.length < n) out += String(b % 10);
  }
  return out;
}

// An 8-digit login code that doesn't start with 0 (so spreadsheets don't drop it).
export const newLoginCode = () => String(1 + Number(randomDigits(1)) % 9) + randomDigits(7);
export const newPin = () => randomDigits(4);

// ---------- PIN hashes ----------
// PBKDF2-SHA256 (Web Crypto, built into the runtime), stored as "pbkdf2-sha256$<iterations>$<salt>$<hash>" in base64.
// It replaced bcryptjs (cost 10), which is pure JavaScript: about 6 times slower, so a whole class signing in at
// once could push a function worker past its CPU limit (status 546).
// Why 50,000 iterations is enough here: a PIN has only 10,000 values, so a stolen hash could be tried against all of
// them whatever the cost. The protection is that pin_hash is never readable (row-level security, column grants) and
// the 5-wrong-PINs lock. The iteration count is stored with each hash, so it can be raised later.
// PINs hashed before with bcrypt ("$2a$…") still work, and are re-hashed at the student's next correct sign-in.
const PBKDF2_PREFIX = "pbkdf2-sha256";
export const PBKDF2_ITERATIONS = 50_000;

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, k, 256));
}

// Compares every byte, so the time taken doesn't depend on where two hashes differ.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [PBKDF2_PREFIX, PBKDF2_ITERATIONS, b64(salt), b64(await pbkdf2(pin, salt, PBKDF2_ITERATIONS))].join("$");
}

export async function pinMatches(pin: string, stored: string): Promise<boolean> {
  if (stored.startsWith(PBKDF2_PREFIX + "$")) {
    const [, its, salt, hash] = stored.split("$");
    const iterations = Number(its);
    if (!Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
    return sameBytes(await pbkdf2(pin, unb64(salt), iterations), unb64(hash));
  }
  return bcrypt.compare(pin, stored); // a PIN hashed before the change
}

// True for a hash in the old format (bcrypt) or with fewer iterations than now: re-hash it after a correct PIN.
export const pinNeedsRehash = (stored: string): boolean => !stored.startsWith(PBKDF2_PREFIX + "$" + PBKDF2_ITERATIONS + "$");

// Run when no student has the code, so a wrong code takes as long as a wrong PIN.
let dummyHash: Promise<string> | null = null;
export async function comparePinWithNobody(pin: string): Promise<void> {
  dummyHash ??= hashPin(randomDigits(4));
  await pinMatches(pin, await dummyHash);
}
