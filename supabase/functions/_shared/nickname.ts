// Nickname rules and word filter (section 6). The word list is backend/nickname-filter.json.

import filter from "../../../backend/nickname-filter.json" with { type: "json" };

export const NICKNAME_RULES = "A nickname is 2 to 20 letters or numbers, with single spaces between words.";

// Same rule as private.valid_nickname in the database.
export const validNickname = (n: string) => n.length >= 2 && n.length <= 20 && /^[A-Za-z0-9]+( [A-Za-z0-9]+)*$/.test(n);

const BLOCKED = new Set<string>([...filter.rude, ...filter.slurs, ...filter.identifying]);
const SUBS = filter.substitutions as Record<string, string | string[]>;

// Every spelling of s with the substitutions undone (1 can be i or l, so there may be more than one).
function readings(s: string): string[] {
  let out = [""];
  for (const ch of s.toLowerCase()) {
    const sub = SUBS[ch];
    const options = sub === undefined ? [ch] : Array.isArray(sub) ? sub : [sub];
    out = out.flatMap((p) => options.map((o) => p + o));
    if (out.length > 64) out = out.slice(0, 64); // a name full of 1s: enough readings to catch real words
  }
  return out;
}

// True if any word, or the whole name with its spaces taken out, is a blocked word.
export function nicknameBlocked(nickname: string): boolean {
  const words = nickname.split(" ").filter(Boolean);
  const candidates = [...words, words.join("")];
  return candidates.some((c) => readings(c).some((r) => BLOCKED.has(r)));
}
