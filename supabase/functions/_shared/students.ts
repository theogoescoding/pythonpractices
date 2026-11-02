// Making a student (join-class and teacher-api import): a login code not in use, a random PIN, and the stored forms.

import { encryptCode, hashPin, lookupHash, newLoginCode, newPin } from "./crypto.ts";
import { check, db, HttpError } from "./http.ts";

export const NICKNAME_TAKEN = "That nickname is taken in this class. Try another one.";

// Returns the new student's id with the code and PIN (shown once, never stored in the clear).
// Throws HttpError(409, NICKNAME_TAKEN) if the nickname is in use in the class, ignoring capitals.
export async function createStudent(classId: string, nickname: string, imported = false) {
  const pin = newPin();
  const pinHash = await hashPin(pin);
  for (let tries = 0; tries < 5; tries++) {
    const code = newLoginCode();
    const r = await db().from("students").insert({
      class_id: classId, nickname, imported,
      login_lookup: await lookupHash("login", code), login_code_enc: await encryptCode(code), pin_hash: pinHash,
    }).select("id").single();
    if (!r.error) return { id: r.data.id as string, code, pin };
    if (r.error.code === "23505" && /nickname/.test(r.error.message)) throw new HttpError(409, NICKNAME_TAKEN);
    if (r.error.code !== "23505") check(r, "create student"); // a used code (login_lookup): draw another
  }
  throw new Error("no free login code after 5 tries");
}
