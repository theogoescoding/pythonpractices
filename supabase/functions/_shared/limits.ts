// Per-IP rate limit for join-class and resume: 300 requests every 10 minutes from one IP, for each function.
// High enough for a whole school behind one IP; the per-student PIN lock (5 wrong PINs, 15 minutes) is the main
// protection. The counter is keyed by an HMAC of the IP, so IP addresses are never stored.

import { lookupHash } from "./crypto.ts";
import { check, clientIp, db, HttpError } from "./http.ts";

export const RATE_LIMIT_HITS = 300;
export const RATE_LIMIT_WINDOW_SECONDS = 600;

export async function rateLimit(fn: string, req: Request): Promise<void> {
  const key = await lookupHash("ip", fn + ":" + clientIp(req));
  const allowed = check(await db().rpc("rate_limit_hit",
    { p_key: key, p_max_hits: RATE_LIMIT_HITS, p_window_seconds: RATE_LIMIT_WINDOW_SECONDS }), "rate limit");
  if (!allowed) throw new HttpError(429, "Too many tries from this network. Wait 10 minutes and try again.");
}
