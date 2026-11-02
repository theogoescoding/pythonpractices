// join-class (no sign-in): POST { class_code, nickname }
// Makes a student in the class and returns their 8-digit code and PIN, once, with a session token so they can start.

import { signToken } from "../_shared/crypto.ts";
import { check, db, HttpError, serve } from "../_shared/http.ts";
import { rateLimit } from "../_shared/limits.ts";
import { NICKNAME_RULES, nicknameBlocked, validNickname } from "../_shared/nickname.ts";
import { createStudent } from "../_shared/students.ts";

const NO_CLASS = "That class code isn't right, or the class has ended. Check it with your teacher.";

serve(async (body, req) => {
  await rateLimit("join-class", req);
  const classCode = typeof body.class_code === "string" ? body.class_code.trim().toUpperCase() : "";
  const nickname = typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!/^[A-Z0-9]{6}$/.test(classCode)) throw new HttpError(400, NO_CLASS);

  const today = new Date().toISOString().slice(0, 10);
  const cls = check(await db().from("classes").select("id, name").eq("class_code", classCode)
    .gte("end_of_year", today).maybeSingle(), "find class");
  if (!cls) throw new HttpError(404, NO_CLASS);

  if (!validNickname(nickname)) throw new HttpError(400, NICKNAME_RULES);
  if (nicknameBlocked(nickname)) throw new HttpError(400, "Please choose a different nickname.");

  const s = await createStudent(cls.id, nickname);
  return { code: s.code, pin: s.pin, nickname, class_name: cls.name, ...(await signToken(s.id)) };
});
