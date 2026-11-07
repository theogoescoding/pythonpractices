// resume (no sign-in): POST { code, pin }
// Checks a returning student's 8-digit code and 4-digit PIN and returns a session token valid for 8 hours.
// 5 wrong PINs in a row lock the account for 15 minutes; the right PIN doesn't open it early.

import { comparePinWithNobody, hashPin, lookupHash, pinMatches, pinNeedsRehash, signToken } from "../_shared/crypto.ts";
import { check, db, HttpError, serve } from "../_shared/http.ts";
import { rateLimit } from "../_shared/limits.ts";

const WRONG = "That code or PIN isn't right.";

function lockedError(until: string): HttpError {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60000));
  return new HttpError(401, WRONG + " Too many wrong PINs: try again in " + minutes + (minutes === 1 ? " minute." : " minutes."),
    { locked_until: until });
}

serve(async (body, req) => {
  await rateLimit("resume", req);
  const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!/^\d{8}$/.test(code) || !/^\d{4}$/.test(pin)) throw new HttpError(401, WRONG);

  const s = check(await db().from("students").select("id, nickname, pin_hash, classes(name)")
    .eq("login_lookup", await lookupHash("login", code)).maybeSingle(), "find student");
  if (!s) {
    await comparePinWithNobody(pin);
    throw new HttpError(401, WRONG);
  }

  // Counts this try before the PIN is compared, so tries sent together can't get past the limit.
  const t = check(await db().rpc("pin_try_begin", { p_student: s.id }).single(), "pin try") as
    { allowed: boolean; locked_until: string | null };
  if (!t.allowed) throw t.locked_until ? lockedError(t.locked_until) : new HttpError(401, WRONG);

  if (!(await pinMatches(pin, s.pin_hash))) throw t.locked_until ? lockedError(t.locked_until) : new HttpError(401, WRONG);

  check(await db().rpc("pin_try_succeeded", { p_student: s.id }), "pin ok");
  // A PIN hashed the old way (bcrypt) is saved in the new format now that it is known to be right. If that fails, the
  // student is still signed in, and it is tried again next time.
  if (pinNeedsRehash(s.pin_hash)) {
    const r = await db().from("students").update({ pin_hash: await hashPin(pin) }).eq("id", s.id);
    if (r.error) console.error("pin rehash: " + (r.error.code || "") + " " + r.error.message);
  }
  const cls = s.classes as unknown as { name: string } | null;
  return { nickname: s.nickname, class_name: cls?.name ?? "", ...(await signToken(s.id)) };
});
