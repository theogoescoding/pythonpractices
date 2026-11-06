// One-off (2026-11): every task that converts input() with int(), float() or bool() names it "casting".
// Where the task asks the student to do the conversion (a conversion skill, or a fill/Parsons/write task whose
// answer includes it), the description says "cast"; otherwise a hint does.
// Run once: node tools/casting-words.js   (then add-worked-examples, derive-templates and the tests)
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const file = path.join(ROOT, "tasks.json");
const tasks = JSON.parse(fs.readFileSync(file, "utf8"));

const CONV = /\b(int|float|bool)\(\s*input\(/g;
const KIND = { int: "a whole number", float: "a decimal number", bool: "True or False" };
const mentions = (s) => /\bcast/i.test(s);

// Puts a sentence after the description's first sentence, so it never lands inside an example output at the end.
function insertSentence(desc, sentence) {
  const firstLine = desc.split("\n")[0];
  const m = firstLine.match(/^.*?[.!?](?=\s)/);
  if (m) return m[0] + " " + sentence + desc.slice(m[0].length);
  return sentence + " " + desc;
}

const changed = [];
for (const t of tasks) {
  const fns = [...new Set([...(t.solution || "").matchAll(CONV)].map((m) => m[1]))];
  if (!fns.length) continue;
  const named = fns.map((f) => f + "()").join(" and ");
  const into = fns.map((f) => KIND[f]).join(" or ");
  // Does the student have to write the conversion? (It is in a blank, a Parsons line, or a write task's answer
  // that the starter doesn't already contain.)
  const starterHas = fns.every((f) => new RegExp("\\b" + f + "\\(\\s*input\\(").test(t.starter || ""));
  const asked = t.skills.some((s) => s === "int()" || s === "input-conversion") ||
    (t.type === "fill" && (t.answers || []).some((a) => fns.some((f) => a.includes(f)))) ||
    (t.type === "write" && !starterHas) || t.type === "parsons";
  let where = null;
  if (asked) {
    if (!mentions(t.description)) {
      t.description = insertSentence(t.description, "Cast the input to " + into + " with " + named + " (this is called casting).");
      where = "description";
    }
  } else if (!mentions(t.description) && !t.hints.some(mentions)) {
    const sentence = named + " turns the text from input() into " + into + ": this is called casting.";
    const i = t.hints.findIndex((h) => fns.some((f) => h.includes(f + "(")));
    if (i >= 0) { t.hints[i] = t.hints[i].replace(/\s*$/, "") + " Converting input like this is called casting."; where = "hint " + (i + 1); }
    else if (t.hints.length < 3) { t.hints.push(sentence[0].toUpperCase() === sentence[0] ? sentence : sentence); where = "new hint"; }
    else { t.description = insertSentence(t.description, sentence[0].toUpperCase() + sentence.slice(1)); where = "description"; }
  }
  if (where) changed.push(t.id + " (" + where + ")");
}
fs.writeFileSync(file, JSON.stringify(tasks, null, 2) + "\n");
console.log("Named casting in " + changed.length + " tasks.");
if (process.argv.includes("-v")) console.log(changed.join("\n"));
