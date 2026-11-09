"use strict";

// Each unit has ONE level (1-10) per student. The level sets how much support a
// task gives (1-2 predict, 3-4 fill in, 5-6 parsons, 7 complete a line,
// 8-10 write) – see curriculum.js.

// ===================== Adaptive difficulty settings =====================
const START_LEVEL = 1;                     // level for every unit when a student starts it (test mode can change this)
const MIN_LEVEL = 1;
const MAX_LEVEL = 10;
const MAX_HINTS_FOR_A_STRONG_PASS = 1;     // a pass only counts towards moving up if it used this many hints or fewer

// Normal move up
const PASSES_IN_A_ROW_TO_LEVEL_UP = 2;     // strong passes in a row that move the student up
const NORMAL_LEVEL_STEP = 1;

// Fast move up
const FAST_RUN_LENGTH = 5;                 // strong passes in a row needed for a fast move up
const FAST_MIN_DIFFERENT_SKILLS = 3;       // ...and those tasks must cover at least this many different skills
const FAST_LEVEL_STEP = 2;                 // a fast move goes up this many levels instead of NORMAL_LEVEL_STEP

// Move down
const FAILS_IN_A_ROW_TO_LEVEL_DOWN = 2;    // fails in a row that move the student down
const HINTS_ON_ONE_TASK_TO_LEVEL_DOWN = 3; // using this many hints on one task moves the student down, even on a pass
const DOWN_LEVEL_STEP = 1;

// Recovery drop: falling back after jumping too far
const RECOVERY_WINDOW_TASKS = 3;           // fails in a row within this many tasks of a level increase cause a recovery drop
const RECOVERY_CEILING_TASKS = 5;          // after a recovery drop, the new level is the ceiling for this many tasks

// Time taken is deliberately NOT used as a signal.

// ===================== Skills secured (progress summary) =====================
const SECURED_PASSES_IN_A_ROW = 2;         // a skill is secured after this many passes in a row on tasks with that skill...
const SECURED_MAX_HINTS = 1;               // ...each using this many hints or fewer. Once secured, a skill stays secured.

// ===================== Extended programs and endless mode =====================
// A unit is completed when the student meets the normal move-up rule at MAX_LEVEL.
// That unlocks endless mode for the unit, and from-scratch tasks in it.
const SCRATCH_EVERY_N_TASKS = 3;           // after completing a unit, every Nth task there at the top level is "write from scratch"
const ENDLESS_COMBINED_CHANCE = 0.35;      // in endless mode with 2+ units ticked, chance that the next task is a combined task
const MAX_VARIANT_TRIES = 10;              // tries to get a variant that differs from the last one

// ===================== Placement test =====================
// The first time a student opens a unit they take one placement task at each of these levels, in this order.
const PLACEMENT_LEVELS = [2, 5, 7, 9];
const PLACEMENT_ATTEMPTS = 2;              // checks allowed on each placement task (hints are allowed and counted)
const PLACEMENT_MAX_LEVEL = 8;             // placement never starts a student above this; practice can still reach MAX_LEVEL
const PLACEMENT_TAG = "placement";         // tasks with this tag are only used for placement, never in practice

// ===================== "This is too easy" / "This is way too hard" =====================
const BUTTON_JUMP_LEVELS = 1;              // levels moved by either button (each can be used once per unit)

// ===================== "Show me how" =====================
// After this many failed attempts on the same task (counted across visits), a "Show me how" button appears.
// Using it shows a worked example; the task can't then be a strong pass, but it doesn't count towards
// HINTS_ON_ONE_TASK_TO_LEVEL_DOWN, and it doesn't change the level or the streaks by itself.
const SHOW_HOW_AFTER_FAILS = 2;

// ===================== Never repeating a passed task =====================
// Every task has a fingerprint: a bank task's id, or a template variant's template id plus its parameter values.
// A passed fingerprint is never served again in that unit. Failed tasks may come back.
const MAX_NEW_VARIANT_TRIES = 40;          // draws to find a template variant that hasn't been passed

// ===================== Other settings =====================
const MAX_HINTS_PER_TASK = 3;
const RUN_TIMEOUT_MS = 5000;               // stop a run after this long (e.g. an infinite loop)

const { UNITS, TYPE_INFO, unitById, unitTitle, levelName, hasScratch, hasPlacement } =
  typeof module === "object" && module.exports ? require("./curriculum.js") : self.Curriculum;

// ===================== Adaptive logic (pure functions) =====================

function freshUnitState(level) {
  const start = level || START_LEVEL;
  return {
    level: start,
    highest: start,
    passStreak: 0,        // strong passes in a row since the last level change (normal move up)
    strongRun: 0,         // strong passes in a row, not reset by a normal move up (fast move up)
    recentSkills: [],     // skills of the last FAST_RUN_LENGTH tasks
    failStreak: 0,        // fails in a row since the last level change (move down)
    failsInARow: 0,       // fails in a row, only reset by a pass (shown in the teacher view)
    sinceLevelUp: null,   // tasks finished since the last level increase (null: none recently)
    ceiling: null,        // highest level allowed after a recovery drop
    ceilingTasksLeft: 0,
    stats: { finished: 0, passes: 0, fails: 0, hints: 0 },
    lastAttempt: null,
    log: {},              // per task (or "tpl:<template id>"): { timesSet, attempts, hintsUsed, passes, fails, lastResult }
    history: [],          // finished tasks, newest last
    skills: {},           // per skill in this unit: { attempts, passes, run, secured }
    completedTop: false,  // met the move-up rule at MAX_LEVEL: endless mode and from-scratch tasks unlocked
    sinceScratch: 0,      // tasks since the last from-scratch task
    current: null,
    lastTaskId: null,
    lastTemplateId: null,
    lastSignature: null,
    placement: null,      // see newPlacement(); null or missing: the unit was started before placement existed
    buttonsUsed: {},      // { "too-easy": true, "too-hard": true } once used in this unit
    passedTop: false,     // passed a level 10 task in this unit (glowing card, complete badge)
    passedFingerprints: {}, // fingerprint → time passed: never served again
    failedAttempts: {},   // fingerprint → failed checks on that task (kept across visits; "Show me how")
    failedVariants: {},   // fingerprint → { templateId, seed, level } of template variants failed and not yet passed
    lastFingerprint: null,
  };
}

// ---------- Saved progress from earlier versions ----------
// Skills that were renamed, so each skill has one name (the one in curriculum.js).
const SKILL_RENAMES = { "and-or": "and/or", validation: "input-validation" };
const PROGRESS_VERSION = 2;

function mergeSkillState(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { attempts: (a.attempts || 0) + (b.attempts || 0), passes: (a.passes || 0) + (b.passes || 0), run: Math.max(a.run || 0, b.run || 0), secured: !!(a.secured || b.secured) };
}

function mergeLogEntry(a, b) {
  const later = (a.lastAttempt || "") >= (b.lastAttempt || "") ? a : b;
  const out = Object.assign({}, later);
  for (const k of ["timesSet", "attempts", "hintsUsed", "passes", "fails", "failedAttempts", "showHowUsed"]) if (k in a || k in b) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

// Brings saved progress up to date. Nothing is removed: stored records keep their shape and only gain fields.
//   - renamed skills are merged into their new name
//   - a removed duplicate task (in another task's former_ids, in the same unit) is merged into the task kept
//   - passedFingerprints, failedAttempts (counted from the attempt log) and failedVariants are added
// ctx = { tasks, templates, attempts (this student's attempt log), Templates }. Safe to run more than once.
function migrateProgress(progress, ctx) {
  const { tasks = [], templates = [], attempts = [], Templates } = ctx || {};
  const unitOfTask = Object.fromEntries(tasks.map((t) => [t.id, t.unit]));
  const renamedTo = {};
  // A replacement (former_ids_are_replacements) is a different task, so the old one's progress isn't moved onto it.
  for (const t of tasks) if (!t.former_ids_are_replacements) for (const old of t.former_ids || []) renamedTo[old] = t.id;
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const currentId = (id, unitId) => (renamedTo[id] && unitOfTask[renamedTo[id]] === unitId ? renamedTo[id] : id);
  const renameSkills = (skills) => [...new Set((skills || []).map((s) => SKILL_RENAMES[s] || s))];
  let changed = false;

  for (const [unitId, s] of Object.entries(progress.units || {})) {
    if (!s) continue;
    if (s.skills) {
      for (const [old, now] of Object.entries(SKILL_RENAMES)) {
        if (!(old in s.skills)) continue;
        s.skills[now] = mergeSkillState(s.skills[now], s.skills[old]);
        delete s.skills[old];
        changed = true;
      }
    }
    for (const h of s.history || []) if (h.skills && h.skills.some((sk) => sk in SKILL_RENAMES)) { h.skills = renameSkills(h.skills); changed = true; }
    if (Array.isArray(s.recentSkills)) s.recentSkills = s.recentSkills.map((list) => renameSkills(list));
    s.log = s.log || {};
    for (const key of Object.keys(s.log)) {
      const now = currentId(key, unitId);
      if (now === key) continue;
      s.log[now] = s.log[now] ? mergeLogEntry(s.log[now], s.log[key]) : s.log[key];
      delete s.log[key];
      changed = true;
    }
    if (s.current && !s.current.task && currentId(s.current.taskId, unitId) !== s.current.taskId) { s.current.taskId = currentId(s.current.taskId, unitId); changed = true; }
    if (s.lastTaskId) s.lastTaskId = currentId(s.lastTaskId, unitId);
    if (!s.passedFingerprints) {
      s.passedFingerprints = {};
      for (const [key, e] of Object.entries(s.log)) if (!key.startsWith("tpl:") && e.passes) s.passedFingerprints[key] = e.lastAttempt || true;
      changed = true;
    }
    if (!s.failedAttempts) {
      s.failedAttempts = {};
      for (const a of attempts) {
        if ((a.kind || "attempt") !== "attempt" || a.result !== "fail" || a.unit !== unitId) continue;
        let fp = currentId(a.taskId, unitId);
        if (a.templateId) {
          const tpl = tplById[a.templateId];
          const seed = Number(String(a.taskId).split("#")[1]);
          fp = a.fingerprint || (tpl && !tpl.derived && Templates && seed ? Templates.fingerprintOf(tpl, seed) : null);
        }
        if (fp) s.failedAttempts[fp] = (s.failedAttempts[fp] || 0) + 1;
      }
      changed = true;
    }
    if (!s.failedVariants) { s.failedVariants = {}; changed = true; }
    if (!("lastFingerprint" in s)) s.lastFingerprint = null;
  }
  if (progress.version !== PROGRESS_VERSION) { progress.version = PROGRESS_VERSION; changed = true; }
  return changed;
}

// ---------- Fingerprints (never repeating a passed task) ----------
const fingerprintOf = (t) => (t.generated ? t.fingerprint || t.id : t.id);
// A task is passed in a unit if its fingerprint is recorded there (bank tasks: or the log shows a pass).
function hasPassed(state, fp) {
  if (!state) return false;
  if ((state.passedFingerprints || {})[fp]) return true;
  const e = (state.log || {})[fp];
  return !!(e && e.passes && !fp.includes("|"));
}

// After a task is finished: a pass is remembered for good; a failed template variant is kept so it can come back.
function recordTaskResult(state, t, passed, when) {
  const fp = fingerprintOf(t);
  state.passedFingerprints = state.passedFingerprints || {};
  state.failedVariants = state.failedVariants || {};
  if (passed) {
    state.passedFingerprints[fp] = when || new Date().toISOString();
    delete state.failedVariants[fp];
  } else if (t.generated && !state.passedFingerprints[fp]) {
    state.failedVariants[fp] = { templateId: t.templateId, seed: t.seed, level: t.level };
  }
  state.lastFingerprint = fp;
}

// One more failed check on a task (shown as "Show me how" once it reaches SHOW_HOW_AFTER_FAILS).
function noteFailedAttempt(state, t) {
  const fp = fingerprintOf(t);
  state.failedAttempts = state.failedAttempts || {};
  state.failedAttempts[fp] = (state.failedAttempts[fp] || 0) + 1;
  return state.failedAttempts[fp];
}

const showHowAvailable = (state, t) => ((state && state.failedAttempts) || {})[fingerprintOf(t)] >= SHOW_HOW_AFTER_FAILS;

// ---------- The answer box ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A task's answer as it starts: empty blanks, the Parsons lines shuffled and none used, no predict choice (or missing
// line chosen), an empty trace table, or the starter code.
function initialDraft(t) {
  if (t.type === "fill") return { blanks: t.starter.split("____").slice(1).map(() => "") };
  if (t.type === "trace") return { cells: {} };
  if (t.type === "partial-parsons") return { choice: null };
  if (t.type === "parsons") {
    const items = t.solution.split("\n").filter((l) => l.trim()).map((l, i) => ({ id: "s" + i, text: l.trim() }));
    t.distractors.forEach((d, i) => items.push({ id: "d" + i, text: d.trim() }));
    return { available: shuffle(items), program: [] };
  }
  if (t.type === "predict") return { choice: null };
  return { code: t.starter || "" };
}

// "Reset this task": puts the answer back to the task's starter (current = the unit's current task).
// It changes nothing else and logs nothing: the level, streaks, ceiling, hints used, passed tasks and the
// failed-attempt count all stay, so "Show me how" still appears after two real failures.
function resetTaskAnswer(current, t) {
  current.draft = initialDraft(t);
  return current;
}

// ---------- Placement test ----------
// status: "pending" (to be taken: new unit, or reset by the teacher), "in-progress", "done",
// "skipped" (level set in test mode) or "not-taken" (started before placement existed).
function newPlacement(used) {
  return { status: "pending", taskIds: [], step: 0, results: [], startLevel: null, used: used || [] };
}

const isPlacementTask = (t) => (t.tags || []).includes(PLACEMENT_TAG);
const needsPlacement = (state) => !!(state && state.placement && ["pending", "in-progress"].includes(state.placement.status));

// One placement task per PLACEMENT_LEVELS level, avoiding tasks this student has already been given (`used`).
function choosePlacementTasks(tasks, unitId, used, rand) {
  rand = rand || Math.random;
  return PLACEMENT_LEVELS.map((level) => {
    const pool = tasks.filter((t) => t.unit === unitId && t.level === level && isPlacementTask(t));
    const fresh = pool.filter((t) => !(used || []).includes(t.id));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.floor(rand() * from.length)] : null;
  });
}

// Starts (or restarts after a teacher reset) the placement test in a unit.
function startPlacement(state, tasks, unitId, rand) {
  const p = state.placement || newPlacement();
  const chosen = choosePlacementTasks(tasks, unitId, p.used, rand).filter(Boolean);
  state.placement = Object.assign(p, {
    status: "in-progress", taskIds: chosen.map((t) => t.id), step: 0, results: [], startLevel: null,
    used: (p.used || []).concat(chosen.map((t) => t.id).filter((id) => !(p.used || []).includes(id))),
  });
  return state.placement;
}

// Highest level passed, at least MIN_LEVEL and at most PLACEMENT_MAX_LEVEL.
// results = [{ level, passed }, …]
function placementStartLevel(results) {
  const passed = results.filter((r) => r.passed).map((r) => r.level);
  return passed.length ? Math.max(MIN_LEVEL, Math.min(PLACEMENT_MAX_LEVEL, Math.max(...passed))) : MIN_LEVEL;
}

// Records one finished placement task. When the last one is done, sets the unit's starting level.
// result = { taskId, level, passed, attempts, hints }. Returns true when the placement test is finished.
function recordPlacementStep(state, result) {
  const p = state.placement;
  p.results.push(result);
  p.step += 1;
  if (p.step < p.taskIds.length) return false;
  p.status = "done";
  p.startLevel = placementStartLevel(p.results);
  p.finishedAt = new Date().toISOString();
  Object.assign(state, { level: p.startLevel, highest: Math.max(state.highest || 0, p.startLevel), passStreak: 0, strongRun: 0, failStreak: 0, sinceLevelUp: null, ceiling: null, ceilingTasksLeft: 0 });
  return true;
}

// Teacher reset: the student takes the placement test once more the next time they open the unit.
// Tasks already given are remembered so different ones are chosen. Returns false if there was nothing to reset.
function resetPlacement(state) {
  if (!state) return false;
  const used = (state.placement && state.placement.used) || [];
  state.placement = newPlacement(used);
  state.current = null;
  return true;
}

// ---------- Attempt records ----------
const checkerLib = () => (typeof module === "object" && module.exports ? require("./checker.js") : self.Checker);

// The record saved for one attempt (Store.logAttempt) and exported for the teacher.
// o = { task, unit, phase, kind ("attempt" | "skip" | "hint"), hintType ("show-me-how", for kind "hint"),
//       attemptNumber, hints, result, failure (Checker.classifyAttempt), code, levelBefore, levelAfter }
function attemptRecord(o) {
  const t = o.task;
  const rec = {
    kind: o.kind || "attempt", unit: o.unit, units: t.units || [t.unit], taskId: t.id, templateId: t.templateId || null,
    phase: o.phase, taskType: t.type, taskLevel: t.level, attemptNumber: o.attemptNumber, result: o.result, hints: o.hints,
    levelBefore: o.levelBefore, levelAfter: o.levelAfter,
  };
  if (t.generated && t.fingerprint) rec.fingerprint = t.fingerprint;
  if (o.kind === "hint") rec.hintType = o.hintType;
  if (o.assignmentId) rec.assignmentId = o.assignmentId; // an attempt on a class assignment (phase "assignment")
  const f = o.failure;
  if (f) {
    // A trace task's evidence is its first wrong row (failedTest is the row number): its expected value is that row
    // of the real table, and the inputs are the program's.
    const trace = t.type === "trace";
    const test = f.failedTest == null ? null : trace ? t.tests[0] : t.tests[f.failedTest];
    const expected = !test ? null : t.type === "predict" ? t.options[t.answer]
      : trace ? checkerLib().traceRowText(t.trace, t.trace.rows[f.failedTest] || []) : test.expected;
    Object.assign(rec, {
      category: f.category, details: f.details, misconceptions: checkerLib().matchMisconceptions(t, f),
      code: o.code || "", failedTest: f.failedTest == null ? null : f.failedTest + 1,
      inputs: test ? test.inputs : null, expected,
      output: f.output, errorType: f.errorType, errorKind: f.errorKind,
    });
  }
  return rec;
}

// ---------- "This is too easy" / "This is way too hard" ----------
const LEVEL_BUTTONS = { "too-easy": 1, "too-hard": -1 };

function levelButtonAvailable(state, button) {
  if (!(button in LEVEL_BUTTONS) || (state.buttonsUsed || {})[button]) return false;
  const target = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, state.level + LEVEL_BUTTONS[button] * BUTTON_JUMP_LEVELS));
  return target !== state.level;
}

// The new level and reset streaks after a button press, or null if the button can't be used.
// The adaptive rule itself is unchanged: it carries on from the new level with fresh streaks.
function applyLevelButton(state, button) {
  if (!levelButtonAvailable(state, button)) return null;
  const level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, state.level + LEVEL_BUTTONS[button] * BUTTON_JUMP_LEVELS));
  return {
    level, highest: Math.max(state.highest || state.level, level),
    passStreak: 0, strongRun: 0, failStreak: 0, recentSkills: [], sinceLevelUp: null, ceiling: null, ceilingTasksLeft: 0,
    buttonsUsed: Object.assign({}, state.buttonsUsed, { [button]: true }),
    change: level - state.level,
  };
}

const levelButtonMessage = (button, level) =>
  (button === "too-easy" ? "Great – let's try Level " : "No problem – let's try Level ") + level + ".";

// Applies a button to a unit's state and logs it (store is Store in the browser, or a stand-in in the tests).
// Returns { from, to, message } or null if the button can't be used.
function pressLevelButton(o) {
  const { state, button, studentId, unitId, taskId, store } = o;
  const from = state.level;
  const r = applyLevelButton(state, button);
  if (!r) return null;
  const { change, ...fields } = r;
  Object.assign(state, fields);
  store.logButton({ studentId, unit: unitId, taskId, button, from, to: state.level });
  store.logLevelChange({ studentId, unit: unitId, from, to: state.level, reason: button, taskId });
  return { from, to: state.level, message: levelButtonMessage(button, state.level) };
}

// ---------- Skills ----------
// A skill name can be in more than one unit's list (e.g. "accumulator"). It then belongs to the
// first of `preferred` (usually the task's own units) that lists it, otherwise to the earliest unit.
const SKILL_OWNER = {};
for (const u of UNITS) for (const s of u.skills) if (!(s in SKILL_OWNER)) SKILL_OWNER[s] = u.id;
const unitHasSkill = (unitId, skill) => UNITS.some((u) => u.id === unitId && u.skills.includes(skill));
const unitOfSkill = (skill, preferred) => (preferred || []).find((u) => unitHasSkill(u, skill)) || SKILL_OWNER[skill] || null;

// Records one finished task for each of its skills. Returns a new skills map.
function updateSkillStates(skillStates, skills, outcome) {
  const next = Object.assign({}, skillStates);
  for (const skill of skills) {
    const st = Object.assign({ attempts: 0, passes: 0, run: 0, secured: false }, next[skill]);
    st.attempts += 1;
    if (outcome.passed) st.passes += 1;
    st.run = outcome.passed && outcome.hints <= SECURED_MAX_HINTS ? st.run + 1 : 0;
    if (st.run >= SECURED_PASSES_IN_A_ROW) st.secured = true;
    next[skill] = st;
  }
  return next;
}

// "secured", "in-progress" or "not-started"
function skillStatus(st) {
  if (st && st.secured) return "secured";
  return st && st.attempts ? "in-progress" : "not-started";
}

// Progress saved before skills were tracked: work the skill states out from each unit's history.
function ensureSkillStates(progress, findTask) {
  for (const [unitId, s] of Object.entries(progress.units)) {
    if (s.skills) continue;
    s.skills = {};
    for (const h of s.history || []) {
      const t = findTask(h.taskId);
      const skills = (h.skills || (t ? t.skills : [])).filter((sk) => unitOfSkill(sk, [unitId]) === unitId);
      s.skills = updateSkillStates(s.skills, skills, { passed: h.result === "pass", hints: h.hints || 0 });
    }
  }
}

// True if this task completes the unit: the move-up rule is met while already at MAX_LEVEL.
const isStrongPass = (outcome) => outcome.passed && outcome.hints <= MAX_HINTS_FOR_A_STRONG_PASS && !outcome.showHow;

function completesTopLevel(state, outcome) {
  return state.level === MAX_LEVEL && isStrongPass(outcome) &&
    (state.passStreak || 0) + 1 >= PASSES_IN_A_ROW_TO_LEVEL_UP;
}

// ---------- Templates ----------
// Templates follow the same skillMinLevel rule as bank tasks (see tasksAt).
const singleTemplates = (templates, unitId, level) => {
  const minLevels = (unitById(unitId) || {}).skillMinLevel || {};
  return templates.filter((t) => t.units.length === 1 && t.units[0] === unitId && t.level === level && t.type !== "scratch" &&
    (t.skills || []).every((s) => !(level < (minLevels[s] || 0))));
};
const scratchTemplates = (templates, unitId) => templates.filter((t) => t.type === "scratch" && t.units[0] === unitId);
const combinedTemplates = (templates, unitIds, levelOf) =>
  templates.filter((t) => t.units.length >= 2 && t.units.every((u) => unitIds.includes(u) && levelOf(u) >= t.level));

// A random item, avoiding `avoid` if there is anything else to pick.
function pickAvoiding(items, avoid, key, rand) {
  const others = items.filter((x) => key(x) !== avoid);
  const pool = others.length ? others : items;
  return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
}

// A variant of the template that differs from the last task served (lastSignature). Expression templates only.
function freshVariant(tpl, lastSignature, rand, Templates) {
  let task = null;
  for (let k = 0; k < MAX_VARIANT_TRIES; k++) {
    task = Templates.expand(tpl, Templates.randomSeed(rand));
    if (Templates.signature(task) !== lastSignature) break;
  }
  return task;
}

// Unit practice: is the next task a from-scratch task?
function scratchDue(state) {
  return !!state.completedTop && state.level === MAX_LEVEL && (state.sinceScratch || 0) >= SCRATCH_EVERY_N_TASKS - 1;
}

// A new variant from one of `tpls` whose fingerprint hasn't been passed in any of `states` and isn't the last task.
// realise(tpl, seed) → (Promise of) the task, or null. Returns null only if every draw failed.
async function newVariant(tpls, states, last, rand, realise, Templates) {
  if (!tpls.length) return null;
  for (let k = 0; k < MAX_NEW_VARIANT_TRIES; k++) {
    const tpl = pickAvoiding(tpls, k < MAX_NEW_VARIANT_TRIES / 2 ? last.templateId : null, (t) => t.id, rand);
    const task = await realise(tpl, Templates.randomSeed(rand));
    if (!task) continue;
    const fp = fingerprintOf(task);
    if (fp === last.key || states.some((s) => hasPassed(s, fp))) continue;
    if (last.signature && Templates.signature(task) === last.signature) continue;
    return task;
  }
  return null;
}

// A template variant failed before (and not passed since) at this level, made again.
async function failedVariantAgain(state, templates, level, last, rand, realise) {
  const tplById = Object.fromEntries(templates.map((t) => [t.id, t]));
  const due = Object.entries(state.failedVariants || {})
    .filter(([fp, v]) => v.level === level && tplById[v.templateId] && fp !== last.key && !hasPassed(state, fp));
  while (due.length) {
    const [[fp, v]] = due.splice(Math.floor(rand() * due.length), 1);
    const task = await realise(tplById[v.templateId], v.seed);
    if (task && fingerprintOf(task) === fp) return task;
    delete state.failedVariants[fp]; // the template has changed: this variant can't be made again
  }
  return null;
}

// The next practice task in one unit at the student's level, by the repeat rule:
//   1. bank tasks not yet passed (never seen first), 2. template variants failed before,
//   3. new template variants. A passed task is never served, and never the same task twice in a row.
// o = { tasks, templates, unitId, state, last: { key (fingerprint), templateId, signature }, rand, realise, Templates }
async function chooseNextTask(o) {
  const { tasks, templates, unitId, state, Templates } = o;
  const rand = o.rand || Math.random;
  const last = o.last || {};
  const level = state.level;
  const bank = chooseTask(tasks, unitId, level, state.log || {}, last.key, rand, state.passedFingerprints || {});
  if (bank) return bank;
  const again = await failedVariantAgain(state, templates, level, last, rand, o.realise);
  if (again) return again;
  return newVariant(singleTemplates(templates, unitId, level), [state], last, rand, o.realise, Templates);
}

// A from-scratch task for a completed unit (never one already passed).
function chooseScratchTask(o) {
  const { templates, unitId, state, Templates } = o;
  return newVariant(scratchTemplates(templates, unitId), [state], o.last || {}, o.rand || Math.random, o.realise, Templates);
}

// Endless mode: the next task from the ticked units. Only units the student has completed are used.
// The same repeat rule as practice applies in each unit.
// last = { key, unit, templateId, signature } of the previous task. Returns (a Promise of) a task.
async function chooseEndlessTask(o) {
  const { tasks, templates, units, unitIds, last, Templates } = o;
  const rand = o.rand || Math.random;
  const realise = o.realise || ((tpl, seed) => Templates.expand(tpl, seed));
  const open = unitIds.filter((u) => units[u] && units[u].completedTop);
  if (!open.length) return null;
  if (open.length >= 2 && rand() < ENDLESS_COMBINED_CHANCE) {
    const combos = combinedTemplates(templates, open, (u) => units[u].level);
    const task = await newVariant(combos, open.map((u) => units[u]), last, rand, realise, Templates);
    if (task) return task;
  }
  const unitId = pickAvoiding(open, open.length > 1 ? last.unit : null, (u) => u, rand);
  const s = units[unitId];
  const task = await chooseNextTask({ tasks, templates, unitId, state: s, last, rand, realise, Templates });
  if (task || s.level !== MAX_LEVEL) return task;
  return chooseScratchTask({ templates, unitId, state: s, last, rand, realise, Templates });
}

// Given a unit's state and how a task went, work out the new level, streaks and ceiling.
// outcome = { passed: boolean, hints: number used, skills: [skill ids of the task], showHow: "Show me how" was used }
// "Show me how" stops a pass being strong, but isn't counted in hints (so not in the 3-hints move down).
// Returns the changed fields plus change (levels moved) and reason
// ("hints", "fails", "recovery", "fast", "passes" or "" when the level didn't change).
function applyOutcome(state, outcome) {
  const strong = isStrongPass(outcome);
  let passStreak = strong ? (state.passStreak || 0) + 1 : 0;
  let strongRun = strong ? (state.strongRun || 0) + 1 : 0;
  let failStreak = outcome.passed ? 0 : (state.failStreak || 0) + 1;
  const failsInARow = outcome.passed ? 0 : (state.failsInARow || 0) + 1;
  const recentSkills = (state.recentSkills || []).concat([outcome.skills || []]).slice(-FAST_RUN_LENGTH);
  let sinceLevelUp = state.sinceLevelUp == null ? null : state.sinceLevelUp + 1;
  let ceiling = state.ceiling == null ? null : state.ceiling;
  let ceilingTasksLeft = state.ceilingTasksLeft || 0;

  let step = 0;
  let reason = "";
  if (outcome.hints >= HINTS_ON_ONE_TASK_TO_LEVEL_DOWN) {
    step = -DOWN_LEVEL_STEP; reason = "hints";
  } else if (failStreak >= FAILS_IN_A_ROW_TO_LEVEL_DOWN) {
    step = -DOWN_LEVEL_STEP;
    reason = sinceLevelUp != null && sinceLevelUp <= RECOVERY_WINDOW_TASKS ? "recovery" : "fails";
  } else if (strong && strongRun >= FAST_RUN_LENGTH && new Set(recentSkills.flat()).size >= FAST_MIN_DIFFERENT_SKILLS) {
    step = FAST_LEVEL_STEP; reason = "fast";
  } else if (strong && passStreak >= PASSES_IN_A_ROW_TO_LEVEL_UP) {
    step = NORMAL_LEVEL_STEP; reason = "passes";
  }

  let level = state.level + step;
  if (step > 0 && ceiling != null) level = Math.min(level, ceiling);
  level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));
  const change = level - state.level;

  if (step !== 0) { passStreak = 0; failStreak = 0; }
  if (reason === "fast") strongRun = 0;
  if (change > 0) sinceLevelUp = 0;
  if (change < 0) sinceLevelUp = null;

  // The ceiling lasts for the RECOVERY_CEILING_TASKS tasks after the recovery drop.
  if (reason === "recovery") { ceiling = level; ceilingTasksLeft = RECOVERY_CEILING_TASKS; }
  else if (ceilingTasksLeft > 0) { ceilingTasksLeft -= 1; if (ceilingTasksLeft === 0) ceiling = null; }

  return {
    level, highest: Math.max(state.highest || state.level, level),
    passStreak, strongRun, recentSkills, failStreak, failsInARow, sinceLevelUp, ceiling, ceilingTasksLeft,
    change, reason: change === 0 ? "" : reason,
  };
}

// A short, positive message for a level change (or null if the level didn't change).
function levelMessage(r) {
  if (r.change > 0 && r.reason === "fast") return "Brilliant – you've jumped up to Level " + r.level + "!";
  if (r.change > 0) return "You've moved up to Level " + r.level + "!";
  if (r.reason === "recovery") return "Let's build up a bit more at Level " + r.level + ". You'll stay here for a few tasks to get comfortable.";
  if (r.change < 0) return "Let's build up a bit more at Level " + r.level + ".";
  return null;
}

// Tasks in a unit that may be set at a level in practice (some skills are kept out of the lower levels,
// and placement tasks are kept for placement).
function tasksAt(tasks, unitId, level) {
  const minLevels = (unitById(unitId) || {}).skillMinLevel || {};
  return tasks.filter((t) => t.unit === unitId && t.level === level && !isPlacementTask(t) &&
    t.skills.every((s) => !(level < (minLevels[s] || 0))));
}

// Pick a random bank task in the unit at the given level that hasn't been passed (passed = passedFingerprints),
// never the last one. Never-seen tasks come first, then ones tried but not passed. Returns null if none is left.
// Prefers tasks whose skills differ from the last task's, so a run covers a range of skills.
function chooseTask(tasks, unitId, level, log, lastTaskId, rand, passed) {
  rand = rand || Math.random;
  const isPassed = (t) => !!((passed || {})[t.id] || (log[t.id] && log[t.id].passes));
  const pool = tasksAt(tasks, unitId, level).filter((t) => !isPassed(t) && t.id !== lastTaskId);
  const tiers = [
    pool.filter((t) => !log[t.id]), // never seen
    pool,                           // seen, never passed
  ];
  let candidates = tiers.find((tier) => tier.length > 0) || [];
  const last = tasks.find((t) => t.id === lastTaskId);
  if (last) {
    const fresh = candidates.filter((t) => !t.skills.some((s) => last.skills.includes(s)));
    if (fresh.length) candidates = fresh;
  }
  return candidates.length ? candidates[Math.floor(rand() * candidates.length)] : null;
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    START_LEVEL, MIN_LEVEL, MAX_LEVEL, MAX_HINTS_FOR_A_STRONG_PASS, PASSES_IN_A_ROW_TO_LEVEL_UP, NORMAL_LEVEL_STEP,
    FAST_RUN_LENGTH, FAST_MIN_DIFFERENT_SKILLS, FAST_LEVEL_STEP, FAILS_IN_A_ROW_TO_LEVEL_DOWN,
    HINTS_ON_ONE_TASK_TO_LEVEL_DOWN, DOWN_LEVEL_STEP, RECOVERY_WINDOW_TASKS, RECOVERY_CEILING_TASKS, MAX_HINTS_PER_TASK,
    SECURED_PASSES_IN_A_ROW, SECURED_MAX_HINTS, SCRATCH_EVERY_N_TASKS, ENDLESS_COMBINED_CHANCE,
    PLACEMENT_LEVELS, PLACEMENT_ATTEMPTS, PLACEMENT_MAX_LEVEL, PLACEMENT_TAG, BUTTON_JUMP_LEVELS,
    SHOW_HOW_AFTER_FAILS, MAX_NEW_VARIANT_TRIES, SKILL_RENAMES, PROGRESS_VERSION,
    migrateProgress, fingerprintOf, hasPassed, recordTaskResult, noteFailedAttempt, showHowAvailable, initialDraft, resetTaskAnswer, isStrongPass,
    chooseNextTask, chooseScratchTask, newVariant,
    newPlacement, isPlacementTask, needsPlacement, choosePlacementTasks, startPlacement, placementStartLevel,
    recordPlacementStep, resetPlacement, attemptRecord, levelButtonAvailable, applyLevelButton, levelButtonMessage, pressLevelButton,
    freshUnitState, applyOutcome, levelMessage, tasksAt, chooseTask,
    unitOfSkill, updateSkillStates, skillStatus, ensureSkillStates, completesTopLevel,
    singleTemplates, scratchTemplates, combinedTemplates, freshVariant, scratchDue, chooseEndlessTask,
  };
}

// ===================== Browser app (practice.html only) =====================
if (typeof document !== "undefined" && document.getElementById("task")) Store.whenReady(function () {

  // ---------- Who, and which unit or units ----------
  // practice.html?unit=maths              practise one unit
  // practice.html?mode=endless&units=a,b  endless mode over the ticked (and completed) units
  // practice.html?assignment=<id>        a class assignment (backend mode): practice only, see ASSIGNMENT RULES below
  const params = new URLSearchParams(location.search);
  const student = Store.currentStudent();
  const assignmentId = params.get("assignment");
  const assignment = assignmentId && student ? Store.assignments(student.id).find((a) => a.id === assignmentId) || null : null;
  const inAssignment = !!assignmentId;
  const endless = !inAssignment && params.get("mode") === "endless";
  const unitId = endless || inAssignment ? null : params.get("unit");
  const unit = unitId ? unitById(unitId) : null;
  if (!student || (!endless && !inAssignment && !unit)) { location.replace("app.html"); return; }

  // ASSIGNMENT RULES: an assignment is practice only. Nothing in the student's progress changes (no level, streaks,
  // passed tasks, hint counts or skill states), tries are unlimited, hints are free, "Show me how" is always
  // offered, and only the attempt log records what happened (phase "assignment", with the assignment id).
  // Which task is open and what has been tried is kept in this browser (Store.loadAssignmentWork).
  const progress = Store.loadProgress(student.id);
  // First time in this unit: the placement test comes first (units with noPlacement start at level 1 instead).
  if (unitId && !progress.units[unitId]) progress.units[unitId] = Object.assign(freshUnitState(), { placement: hasPlacement(unitId) ? newPlacement() : null });
  const endlessUnits = endless
    ? (params.get("units") || "").split(",").filter((u) => unitById(u) && progress.units[u] && progress.units[u].completedTop)
    : [];
  if (endless && !endlessUnits.length) { location.replace("endless.html"); return; }
  if (endless) progress.endless = Object.assign({ units: [], current: null, last: {} }, progress.endless, { units: endlessUnits });
  const work = inAssignment ? Object.assign({ index: 0, current: null, tried: {} }, Store.loadAssignmentWork(student.id, assignmentId)) : null;

  const us = (u) => progress.units[u || unitId];
  const holder = () => (inAssignment ? work : endless ? progress.endless : us()); // where the current task is kept
  const save = () => (inAssignment ? Store.saveAssignmentWork(student.id, assignmentId, work) : Store.saveProgress(student.id, progress));
  // The student's level in a unit, or null if they haven't started it (assignments can use any unit).
  const levelIn = (u) => (progress.units[u] ? progress.units[u].level : null);

  Store.setupDisplaySettings();
  const pageTitle = inAssignment ? "Assignment: " + (assignment ? assignment.title : "not found") : endless ? "Endless mode" : unit.title;
  document.title = pageTitle + " – Python Practice";
  document.getElementById("unit-title").textContent = pageTitle;
  document.getElementById("student-name").textContent = student.name;
  if (endless || inAssignment) {
    document.getElementById("reset-area").hidden = true;
    document.getElementById("side-heading").textContent = inAssignment ? "Assignment" : "Your levels";
  }
  if (inAssignment) document.getElementById("level-help").hidden = true;

  // ---------- Python runner (Web Worker + timeout) ----------
  const pyStatus = document.getElementById("py-status");

  const runner = {
    worker: null, ready: null, job: null, seq: 0, timer: null,

    start() {
      pyStatus.textContent = "loading…";
      let resolveReady;
      this.ready = new Promise((res) => { resolveReady = res; });
      try {
        this.worker = new Worker("worker.js");
      } catch (e) {
        pyStatus.textContent = "couldn't start (open the site through a web server – see README)";
        resolveReady(false);
        return;
      }
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === "ready") { pyStatus.textContent = "ready"; resolveReady(true); }
        else if (m.type === "load-error") { pyStatus.textContent = "couldn't load – check your internet connection, then reload"; resolveReady(false); }
        else if (this.job && m.id === this.job.id) {
          if (m.type === "progress") { this.job.results[m.index] = m.result; this.armTimer(); }
          else if (m.type === "done") this.finish();
        }
      };
      this.worker.onerror = () => { pyStatus.textContent = "couldn't load"; resolveReady(false); };
    },

    armTimer() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.timeout(), RUN_TIMEOUT_MS);
    },

    finish() {
      clearTimeout(this.timer);
      const job = this.job;
      this.job = null;
      job.resolve(job.results);
    },

    timeout() {
      const job = this.job;
      if (!job) return;
      // The test that was running when time ran out gets a Timeout error; later tests were never run.
      const first = job.results.findIndex((r) => r == null);
      for (let i = 0; i < job.results.length; i++) {
        if (job.results[i] == null) {
          job.results[i] = i === first
            ? { output: "", error: { type: "Timeout" }, inputsLeft: 0 }
            : { output: "", error: null, notRun: true };
        }
      }
      this.worker.terminate();
      this.start(); // fresh worker for next time (Pyodide reloads from the browser cache)
      this.finish();
    },

    // Runs code once per inputs list. Resolves to an array of {output, error, inputsLeft}.
    // maxLines: stop after that many lines (the app's own runs of template variants).
    // trace: also record the steps for a trace table (the app's own runs of trace-task variants).
    async run(code, inputLists, maxLines, trace) {
      const ok = await this.ready;
      if (!ok) return null;
      while (this.job) await this.job.done; // one run at a time
      let markDone;
      const done = new Promise((res) => { markDone = res; });
      return new Promise((resolve) => {
        const id = ++this.seq;
        this.job = { id, resolve: (r) => { markDone(); resolve(r); }, done, results: new Array(inputLists.length).fill(null) };
        this.armTimer();
        this.worker.postMessage({ type: "run", id, code, tests: inputLists, maxLines: maxLines || 0, trace: !!trace });
      });
    },

    // jobs = [{ code, inputs, maxLines, trace }] (templates.js) → one result per job, in order.
    async runJobs(jobs) {
      const results = new Array(jobs.length);
      const groups = new Map();
      jobs.forEach((j, i) => {
        const key = j.code + "\u0000" + (j.maxLines || 0) + "\u0000" + (j.trace ? 1 : 0);
        if (!groups.has(key)) groups.set(key, { code: j.code, maxLines: j.maxLines, trace: !!j.trace, idx: [] });
        groups.get(key).idx.push(i);
      });
      for (const g of groups.values()) {
        const res = await this.run(g.code, g.idx.map((i) => jobs[i].inputs), g.maxLines, g.trace);
        g.idx.forEach((i, k) => { results[i] = res ? res[k] : { output: "", error: { type: "Unavailable" }, inputsLeft: 0 }; });
      }
      return results;
    },
  };
  runner.start();

  // Makes a template variant. Derived templates need Python to work out their outputs; without it, they are skipped.
  async function realiseTask(tpl, seed) {
    if (!tpl.derived) return Templates.expand(tpl, seed);
    if (!(await runner.ready)) return null;
    return Templates.realise(tpl, seed, (jobs) => runner.runJobs(jobs));
  }

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function highlight(code) {
    const re = /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(if|elif|else|while|for|in|def|return|and|or|not|True|False|None|break|continue|pass)\b|\b(print|input|int|float|str|len|range)\b(?=\()|\b(\d+(?:\.\d+)?)\b/g;
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      const cls = m[1] ? "c" : m[2] ? "s" : m[3] ? "k" : m[4] ? "f" : "n";
      out += esc(code.slice(last, m.index)) + '<span class="tok-' + cls + '">' + esc(m[0]) + "</span>";
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  const inputsText = (inputs) => (inputs.length ? inputs.map((v) => (v === "" ? "(nothing – just Enter)" : v)).join(", then ") : "(no input)");
  const describeInputs = (inputs) => (inputs.length ? "Input: " + inputsText(inputs) : "No input");

  function showOutput(text) {
    const n = Checker.normalise(text);
    return n === "" ? '<span class="nothing">(no output)</span>' : esc(n);
  }

  // The message for a failed attempt: a matched misconception's explanation first (the main message),
  // then the category message and its "What to try" line.
  function failureHtml(t, failure, extra) {
    const matched = Checker.matchMisconceptions(t, failure).map((id) => misconceptionById[id]).filter((m) => m && m.explanation);
    const parts = Checker.failureParts(failure, { exampleTests: TaskView.EXAMPLE_TESTS }); // says nothing about a hidden test
    return '<div class="problem failure" role="alert">' +
      matched.map((m) => '<p class="misconception"><strong>' + esc(m.name) + ".</strong> " + esc(m.explanation) + "</p>").join("") +
      "<p>" + esc(parts.message + (extra ? " " + extra : "")) + "</p>" +
      '<p class="try-next"><strong>What to try:</strong> ' + esc(parts.tryNext) + "</p></div>";
  }

  // ---------- State ----------
  let tasks = [];
  let taskById = {};
  let templates = [];
  let misconceptionById = {};
  let busy = false;
  let serving = false; // a new task is being made
  let skipArmed = false;
  let resetArmed = false; // "Reset this task" was clicked once and asks to be clicked again
  let notice = null; // message carried over to the next task (e.g. level change)
  let activeEditor = null; // CodeMirror instance on a write task (null with the plain text box)

  const cur = () => holder().current;
  const inPlacement = () => !endless && !inAssignment && needsPlacement(us());
  // Generated tasks (template variants) are kept whole in the current-task record.
  const task = () => cur().task || taskById[cur().taskId];
  const unitsOf = (t) => t.units || [t.unit];         // units whose levels this task counts towards
  const logKey = (t) => (t.generated ? "tpl:" + t.templateId : t.id);

  function logEntry(u, key) {
    const log = us(u).log;
    if (!log[key]) log[key] = { timesSet: 0, attempts: 0, hintsUsed: 0, passes: 0, fails: 0, lastResult: "in progress", levelAtLastAttempt: us(u).level, lastAttempt: null };
    return log[key];
  }
  // The per-task log in each unit's saved state. An assignment changes nothing there.
  const eachLog = (fn) => { if (inAssignment) return; const t = task(); unitsOf(t).forEach((u) => fn(logEntry(u, logKey(t)), u)); };

  function noteAttempt() {
    if (inAssignment) return;
    const now = new Date().toISOString();
    eachLog((entry, u) => {
      entry.attempts += 1;
      entry.levelAtLastAttempt = us(u).level;
      entry.lastAttempt = now;
      us(u).lastAttempt = now;
    });
  }

  async function nextTaskFor() {
    const choice = { tasks, templates, Templates, realise: realiseTask };
    if (endless) {
      const e = progress.endless;
      return chooseEndlessTask(Object.assign(choice, { units: progress.units, unitIds: e.units, last: e.last || {} }));
    }
    const s = us();
    const last = { key: s.lastFingerprint || s.lastTaskId, templateId: s.lastTemplateId, signature: s.lastSignature };
    Object.assign(choice, { unitId, state: s, last });
    if (scratchDue(s)) {
      const t = await chooseScratchTask(choice);
      if (t) { s.sinceScratch = 0; return t; }
    }
    if (s.completedTop && s.level === MAX_LEVEL) s.sinceScratch = (s.sinceScratch || 0) + 1;
    return chooseNextTask(choice);
  }

  // Sets up the next task (a template variant may need Python to run first).
  async function serveNewTask() {
    if (inAssignment) return serveAssignmentTask(work.current ? work.index + 1 : work.index);
    serving = true;
    if ($("results")) $("results").innerHTML = '<p class="running">Getting your next task ready…</p>';
    let t = null;
    try { t = await nextTaskFor(); } finally { serving = false; }
    if (!t) {
      $("task").innerHTML = '<p class="problem">Your next task couldn\'t be made. Check your internet connection (Python needs to load), then reload the page.</p>';
      return false;
    }
    holder().current = { taskId: t.id, task: t.generated ? t : null, started: false, hints: 0, attempts: 0, showHow: 0, finished: false, passed: false, draft: initialDraft(t) };
    eachLog((entry) => {
      entry.timesSet += 1;
      if (!entry.passes && !entry.fails) entry.lastResult = "in progress";
    });
    skipArmed = false;
    resetArmed = false;
    save();
    return true;
  }

  // ---------- Attempt records (teacher view and export) ----------
  // o = { kind: "attempt" | "skip", result: "pass" | "fail" | "skipped", failure (from Checker.classifyAttempt), code, levels }
  function recordAttempt(t, c, o) {
    const u = unitsOf(t)[0];
    if (inAssignment) {
      // The level is only noted (it doesn't change), and failed checks aren't counted for "Show me how".
      if (!work.tried[t.id]) { work.tried[t.id] = "tried"; save(); renderSide(); }
      return Store.logAttempt(student.id, attemptRecord({
        task: t, unit: u, phase: "assignment", assignmentId, kind: o.kind, attemptNumber: c.attempts, hints: c.hints,
        result: o.result, failure: o.failure, code: o.code, levelBefore: levelIn(u), levelAfter: levelIn(u),
      }));
    }
    const lv = (o.levels || {})[u] || { from: us(u).level, to: us(u).level };
    // Failed checks are counted per task in each unit (kept across visits) for "Show me how".
    if ((o.kind || "attempt") === "attempt" && o.result === "fail") { unitsOf(t).forEach((x) => noteFailedAttempt(us(x), t)); save(); }
    return Store.logAttempt(student.id, attemptRecord({
      task: t, unit: u, phase: c.placement ? "placement" : endless ? "endless" : "practice", kind: o.kind,
      attemptNumber: c.attempts, hints: c.hints, result: o.result, failure: o.failure, code: o.code, levelBefore: lv.from, levelAfter: lv.to,
    }));
  }

  // ---------- Assignments ----------
  // The assignment's tasks, in the teacher's order (old ids are found through former_ids; unknown ids are left out).
  let assignmentTasks = [];
  function resolveAssignmentTasks() {
    const renamed = {};
    for (const t of tasks) for (const old of t.former_ids || []) renamed[old] = t.id;
    assignmentTasks = (assignment ? assignment.task_ids : []).map((id) => taskById[id] || taskById[renamed[id]]).filter(Boolean);
  }

  // Opens task number i (wrapping round). A task already open keeps its answer.
  function serveAssignmentTask(i) {
    if (!assignmentTasks.length) return false;
    const index = ((i % assignmentTasks.length) + assignmentTasks.length) % assignmentTasks.length;
    const t = assignmentTasks[index];
    work.index = index;
    work.drafts = work.drafts || {};
    if (work.current && work.current.taskId !== t.id) work.drafts[work.current.taskId] = work.current; // keep the old answer
    work.current = work.drafts[t.id] || { taskId: t.id, task: null, started: true, hints: 0, attempts: 0, showHow: 0, finished: false, passed: false, draft: initialDraft(t) };
    delete work.drafts[t.id];
    skipArmed = false;
    resetArmed = false;
    save();
    return true;
  }

  // ---------- Placement ----------
  function servePlacementTask() {
    const s = us();
    if (s.placement.status === "pending") startPlacement(s, tasks, unitId);
    const p = s.placement;
    let t = taskById[p.taskIds[p.step]];
    if (!t || t.unit !== unitId) {
      // The task for this step was moved to another unit since the test started: use another one at that level.
      t = choosePlacementTasks(tasks, unitId, p.used)[p.step] || null;
      if (t) { p.taskIds[p.step] = t.id; p.used = (p.used || []).concat(p.used && p.used.includes(t.id) ? [] : [t.id]); }
    }
    if (!t) { p.status = "not-taken"; save(); return serveNewTask(); } // no placement tasks in this unit (a promise)
    s.current = { taskId: t.id, task: null, placement: true, started: false, hints: 0, attempts: 0, finished: false, passed: false, draft: initialDraft(t) };
    skipArmed = false;
    resetArmed = false;
    save();
  }

  // Ends the current placement task. After the last one, the starting level is set and logged.
  function finishPlacementStep(passed) {
    const c = cur();
    if (c.finished) return;
    c.finished = true;
    c.passed = passed;
    const t = task();
    const s = us();
    const before = s.level;
    const done = recordPlacementStep(s, { taskId: t.id, level: t.level, passed, attempts: c.attempts, hints: c.hints });
    if (done) {
      const p = s.placement;
      Store.logPlacement({ studentId: student.id, unit: unitId, kind: "result", results: p.results, startLevel: p.startLevel });
      Store.logLevelChange({ studentId: student.id, unit: unitId, from: before, to: p.startLevel, reason: "placement" });
    }
    save();
    renderSide();
  }

  // A failed placement check: the task ends after PLACEMENT_ATTEMPTS tries.
  function placementAfterFail() {
    const c = cur();
    if (c.attempts >= PLACEMENT_ATTEMPTS) { finishPlacementStep(false); return false; }
    return true; // another try is allowed
  }

  function finishTask(passed) {
    const c = cur();
    if (c.finished) return {};
    c.finished = true;
    c.passed = passed;
    const t = task();
    if (inAssignment) {
      // Practice only: the task is marked as done here, and nothing else changes.
      work.tried[t.id] = passed ? "passed" : work.tried[t.id] || "tried";
      save();
      renderSide();
      return {};
    }
    const outcome = { passed, hints: c.hints, skills: t.skills, showHow: (c.showHow || 0) > 0 };
    const now = new Date().toISOString();
    const messages = [];
    const levels = {};
    let kind = "up";

    eachLog((entry, u) => {
      if (passed) entry.passes += 1; else entry.fails += 1;
      entry.lastResult = passed ? "pass" : "fail";
      const s = us(u);
      entry.levelAtLastAttempt = s.level;
      const before = s.level;
      if (passed && t.level === MAX_LEVEL) s.passedTop = true; // glowing card on the landing page
      const completes = !s.completedTop && completesTopLevel(s, outcome);
      // Each unit only counts its own skills towards the fast move up.
      const r = applyOutcome(s, Object.assign({}, outcome, { skills: t.skills.filter((sk) => unitOfSkill(sk, unitsOf(t)) === u) }));
      const { change, reason, ...fields } = r;
      Object.assign(s, fields);
      s.stats.finished += 1;
      s.stats[passed ? "passes" : "fails"] += 1;
      s.stats.hints += c.hints;
      s.lastAttempt = now; // a skip counts as an attempt too
      s.lastTaskId = t.id;
      s.lastTemplateId = t.generated ? t.templateId : null;
      s.lastSignature = t.generated ? Templates.signature(t) : null;
      recordTaskResult(s, t, passed, now); // a passed task is never served again in this unit
      s.history.push({ taskId: t.id, templateId: t.templateId, skills: t.skills, result: passed ? "pass" : "fail", hints: c.hints, showHow: c.showHow || 0, attempts: c.attempts, levelBefore: before, levelAfter: r.level, reason, at: now });
      if (s.history.length > 500) s.history = s.history.slice(-500);
      levels[u] = { from: before, to: r.level };
      if (change !== 0) Store.logLevelChange({ studentId: student.id, unit: u, from: before, to: r.level, reason, taskId: t.id });
      if (completes) {
        s.completedTop = true;
        Store.logLevelChange({ studentId: student.id, unit: u, from: MAX_LEVEL, to: MAX_LEVEL, reason: "completed", taskId: t.id });
        messages.push("You've completed Level " + MAX_LEVEL + " in " + unitTitle(u) + "! Endless mode is now unlocked.");
      }
      const m = levelMessage(r);
      if (m) {
        messages.push(unitsOf(t).length > 1 ? unitTitle(u) + ": " + m : m);
        if (change < 0) kind = "down";
      }
    });

    // Skills are recorded in the unit they belong to, if the student has started it.
    for (const sk of t.skills) {
      const owner = unitOfSkill(sk, unitsOf(t));
      if (owner && progress.units[owner]) progress.units[owner].skills = updateSkillStates(progress.units[owner].skills || {}, [sk], outcome);
    }
    if (endless) progress.endless.last = { key: fingerprintOf(t), unit: t.unit, templateId: t.templateId || null, signature: t.generated ? Templates.signature(t) : null };

    notice = messages.length ? { kind, text: messages.join(" ") } : null;
    save();
    renderSide();
    return levels;
  }

  // ---------- Side panel ----------
  function renderSide() {
    $("reset-area").hidden = endless || inAssignment || inPlacement();
    if (inAssignment) {
      const c = cur();
      $("unit-levels").innerHTML = '<li class="assignment-intro"><strong>' + esc(assignment.title) + "</strong>" +
        (assignment.description ? '<span class="small">' + esc(assignment.description) + "</span>" : "") + "</li>" +
        assignmentTasks.map((t, i) => {
          const state = work.tried[t.id];
          const mark = state === "passed" ? "✓ Done" : state ? "Tried" : "Not tried yet";
          return '<li><button type="button" class="secondary assignment-task' + (c && c.taskId === t.id ? " current" : "") + '" data-assignment-task="' + i + '"' +
            (c && c.taskId === t.id ? ' aria-current="step"' : "") + ">" + (i + 1) + ". " + esc(t.title) + ' <span class="small">· ' + esc(mark) + "</span></button></li>";
        }).join("");
      $("streak-info").textContent = "This is practice set by your teacher. It doesn't change your level or your progress: try as often as you like, and hints are free.";
      return;
    }
    if (inPlacement()) {
      const p = us().placement;
      $("unit-levels").innerHTML = '<li class="unit-progress"><span class="unit-level">Quick check</span>' +
        '<span class="small">Question ' + Math.min(p.step + 1, PLACEMENT_LEVELS.length) + " of " + PLACEMENT_LEVELS.length + "</span></li>";
      $("streak-info").textContent = "This finds a good starting level for you. You have up to " + PLACEMENT_ATTEMPTS + " tries on each question, and hints are allowed.";
      return;
    }
    const shown = endless ? progress.endless.units : [unitId];
    $("unit-levels").innerHTML = shown.map((u) => {
      const s = us(u);
      return '<li class="unit-progress" aria-label="' + esc(unitTitle(u) + ": level " + s.level + " of 10, " + levelName(s.level, u)) + '">' +
        (endless ? '<span class="unit-name">' + esc(unitTitle(u)) + "</span>" : "") +
        '<span class="unit-level">Level ' + s.level + "</span>" +
        '<span class="small">' + esc(levelName(s.level, u)) + "</span>" +
        '<span class="cat-bar" aria-hidden="true"><span style="width:' + s.level * 10 + '%"></span></span></li>';
    }).join("");
    let info = "";
    if (!endless) {
      const s = us();
      if (s.level >= MAX_LEVEL) info = s.completedTop ? (!hasScratch(unitId) ?"You've completed this unit!" : "You've completed this unit! Every " + SCRATCH_EVERY_N_TASKS + " tasks you'll get a write-from-scratch challenge.") :"You're at the top level! " + PASSES_IN_A_ROW_TO_LEVEL_UP + " strong passes in a row here completes the unit.";
      else if (s.ceiling != null && s.level >= s.ceiling) info = "You're settling in at this level for " + s.ceilingTasksLeft + " more task" + (s.ceilingTasksLeft === 1 ? "" : "s") + ".";
      else info = s.passStreak + " of " + PASSES_IN_A_ROW_TO_LEVEL_UP + " strong passes in a row needed to move up.";
    } else {
      info = "Tasks come from the units you ticked, at your level in each." + (progress.endless.units.length > 1 ? " Some tasks combine skills from two units." : "");
    }
    $("streak-info").textContent = info;
  }

  // ---------- Task card ----------
  function banner(t, big) {
    const info = TYPE_INFO[t.type];
    return '<div class="type-banner type-' + t.type + (big ? " big" : "") + '">' +
      '<span class="type-label">' + esc(info.label) + "</span>" +
      '<span class="type-how">' + esc(info.how) + "</span></div>";
  }

  function header(t) {
    return '<h2 id="task-title">' + esc(t.title) + "</h2>" +
      '<p class="meta">' + (inAssignment ? '<span class="cat-tag">Assignment · task ' + (work.index + 1) + " of " + assignmentTasks.length + "</span>" : "") +
        unitsOf(t).map((u) => '<span class="cat-tag">' + esc(unitTitle(u)) + "</span>").join("") +
        " Level " + t.level + " · " + esc(t.type === "scratch" ? "Write from scratch" : levelName(t.level, t.unit)) + " · Task " + esc(t.id) + "</p>" +
      '<p class="description">' + esc(t.description) + "</p>" +
      // The exact output the checker expects for the example test (not on predict tasks: it is the answer).
      (TaskView.showsExpectedOutput(t) ? TaskView.expectedBoxHtml(t) : "");
  }

  function renderTask() {
    if (!cur()) return; // no task could be made (the page already says so)
    const t = task();
    const c = cur();
    if (!c.draft) { c.draft = initialDraft(t); save(); } // e.g. damaged saved data
    const card = $("task");
    card.className = "task-card type-" + t.type;
    activeEditor = null;
    const noticeHtml = notice ? '<p class="notice notice-' + notice.kind + '" role="status">' + esc(notice.text) + "</p>" : "";

    const placementIntro = c.placement
      ? '<div class="placement-intro"><p><strong>Quick check to find your starting point. Don\'t worry if it\'s tricky.</strong></p>' +
        '<p class="small">Question ' + (us().placement.step + 1) + " of " + PLACEMENT_LEVELS.length + " · up to " + PLACEMENT_ATTEMPTS + " tries · hints are allowed</p></div>"
      : "";

    if (!c.started) {
      card.innerHTML = noticeHtml + placementIntro + banner(t, true) + header(t) +
        '<p><button type="button" id="start-btn" class="primary">' + (c.placement ? "Start question" : "Start task") + "</button></p>";
      $("start-btn").addEventListener("click", () => {
        c.started = true; notice = null; save(); renderTask();
        if (activeEditor) { activeEditor.focus(); return; }
        const first = card.querySelector("input, textarea, .p-line, .option input");
        if (first) first.focus();
      });
      return;
    }

    let body = "";
    if (t.type === "fill") body = fillBody(t, c);
    else if (t.type === "parsons") body = parsonsBody();
    else if (t.type === "predict") body = predictBody(t, c);
    else if (t.type === "trace") body = traceBody(t, c);
    else if (t.type === "partial-parsons") body = partialBody(t, c);
    else body = writeBody(t, c);

    const checkLabel = t.type === "predict" ? "Run to check my answer" : "Check my answer";
    const showLevelButtons = !endless && !inAssignment && !c.placement;
    // No Run button on predict and trace tasks: running the program would show the answer.
    const hasRun = t.type !== "predict" && t.type !== "trace";
    card.innerHTML = noticeHtml + (c.placement ? placementIntro : "") + banner(t, false) + header(t) +
      '<div class="task-body">' + body + "</div>" +
      '<div class="actions">' +
        (hasRun ? '<button type="button" id="run-btn" class="secondary">Run</button>' : "") +
        '<button type="button" id="check-btn" class="primary">' + checkLabel + "</button>" +
        '<button type="button" id="hint-btn" class="secondary"></button>' +
        '<button type="button" id="show-how-btn" class="secondary" hidden>Show me how</button>' +
        '<button type="button" id="reset-btn" class="secondary"></button>' +
        '<button type="button" id="next-btn" class="secondary"></button>' +
      "</div>" +
      '<ol id="hints" class="hints" aria-label="Hints"></ol>' +
      '<section id="show-how" class="worked" aria-labelledby="show-how-h" tabindex="-1" hidden></section>' +
      (showLevelButtons ? '<div id="level-buttons" class="level-buttons" role="group" aria-label="Change your level"></div>' : "") +
      '<div id="results" class="results" aria-live="polite"></div>';

    if (t.type === "fill") wireFill(c);
    else if (t.type === "parsons") renderParsons();
    else if (t.type === "predict") wirePredict(t, c);
    else if (t.type === "trace") wireTrace(c);
    else if (t.type === "partial-parsons") wirePartial(t, c);
    else wireWrite(c);

    if ($("run-btn")) $("run-btn").addEventListener("click", runOnce);
    $("check-btn").addEventListener("click", check);
    $("hint-btn").addEventListener("click", showHint);
    $("show-how-btn").addEventListener("click", showHow);
    $("reset-btn").addEventListener("click", resetTask);
    $("next-btn").addEventListener("click", nextTask);
    renderHints();
    renderShowHow();
    renderButtons();
    if (c.finished) renderFinishedMessage();
  }

  function renderButtons() {
    const c = cur();
    const t = task();
    const left = Math.min(MAX_HINTS_PER_TASK, t.hints.length) - c.hints;
    const hintBtn = $("hint-btn");
    // In an assignment hints are free: no count is shown and they never move the student down.
    hintBtn.textContent = inAssignment ? (left > 0 ? "Show a hint" : "That's every hint") : left > 0 ? "Show a hint (" + left + " left)" : "No hints left";
    hintBtn.disabled = left <= 0 || (c.finished && !inAssignment) || busy;
    const next = $("next-btn");
    const nextLabel = !c.placement ? "Next task →" : inPlacement() ? "Next question →" : "Start practising →";
    if (inAssignment) next.textContent = "Next task →"; // moving on is never a fail here
    else next.textContent = c.finished ? nextLabel : skipArmed ? "Skip? This counts as not passed – click again" : c.placement ? "Skip this question" : "Skip this task";
    next.className = c.finished ? "primary" : skipArmed ? "danger" : "secondary";
    $("check-btn").disabled = busy || (t.type === "predict" && c.finished);
    if ($("run-btn")) $("run-btn").disabled = busy;
    // "Show me how": after SHOW_HOW_AFTER_FAILS failed attempts on this task, and after every later failure.
    // In an assignment it is there from the start, after any number of fails.
    const howBtn = $("show-how-btn");
    howBtn.hidden = !!c.placement || (c.finished && c.passed) || !workedExampleFor(t) ||
      (!inAssignment && !unitsOf(t).some((u) => showHowAvailable(us(u), t)));
    howBtn.disabled = busy;
    // "Reset this task": not in placement, and not once there is no answer left to change.
    const resetBtn = $("reset-btn");
    resetBtn.hidden = !!c.placement || (c.finished && (c.passed || t.type === "predict"));
    resetBtn.textContent = resetArmed ? "Reset? Your answer will be cleared – click again" : "Reset this task";
    resetBtn.className = resetArmed ? "danger" : "secondary";
    resetBtn.disabled = busy;
    renderLevelButtons();
  }

  // ---------- "Reset this task" ----------
  // The first click asks for confirmation; the second puts the answer box back to the task's starter.
  // Nothing is logged and nothing else changes (see resetTaskAnswer).
  function resetTask() {
    if (busy) return;
    if (!resetArmed) { resetArmed = true; skipArmed = false; renderButtons(); return; }
    resetArmed = false;
    resetTaskAnswer(cur(), task());
    save();
    renderTask();
    $("results").insertAdjacentHTML("afterbegin", '<p class="small" role="status">Your answer has been reset to the start of the task.</p>');
    if (activeEditor) { activeEditor.focus(); return; }
    const first = $("task").querySelector("input.blank, input.trace-cell, textarea, .p-line, .option input");
    if (first) first.focus();
  }

  // ---------- "Show me how" ----------
  // A bank task's worked example, or (for a template variant) the one of the task it was made from.
  function workedExampleFor(t) {
    if (t.worked_example) return t.worked_example;
    const src = t.source && taskById[t.source];
    return src ? src.worked_example || null : null;
  }

  function showHow() {
    const c = cur();
    const t = task();
    if (!workedExampleFor(t)) return;
    c.showHow = (c.showHow || 0) + 1; // the task can't be a strong pass now; it isn't counted as a hint for moving down
    eachLog((entry) => { entry.showHowUsed = (entry.showHowUsed || 0) + 1; });
    const u = unitsOf(t)[0];
    Store.logAttempt(student.id, attemptRecord({
      task: t, unit: u, phase: inAssignment ? "assignment" : endless ? "endless" : "practice", assignmentId: inAssignment ? assignmentId : null,
      kind: "hint", hintType: "show-me-how", attemptNumber: c.attempts, hints: c.hints, result: "show-me-how", levelBefore: levelIn(u), levelAfter: levelIn(u),
    }));
    save();
    renderShowHow();
    renderButtons();
    $("show-how").focus();
  }

  function renderShowHow() {
    const c = cur();
    const t = task();
    const box = $("show-how");
    const we = workedExampleFor(t);
    box.hidden = !(c.showHow > 0 && we);
    if (box.hidden) return;
    const keyStep = t.hints[t.hints.length - 1];
    box.innerHTML = '<h3 id="show-how-h">Show me how</h3>' +
      "<p><strong>A similar problem:</strong> " + esc(we.problem) + "</p>" +
      '<pre class="code">' + highlight(we.code) + "</pre>" +
      (we.output != null ? '<p class="small">' + (we.inputs && we.inputs.length ? "When the user types " + esc(we.inputs.join(", then ")) + ", it prints:" : "It prints:") + "</p>" +
        '<pre class="output">' + showOutput(we.output) + "</pre>" : "") +
      // A trace-table example shows its whole table.
      (we.trace ? '<p class="small">Its trace table:</p>' + traceTableHtml(we.trace, null, true) : "") +
      "<p><strong>The key idea:</strong> " + esc(we.key_idea) + "</p>" +
      "<p><strong>The key step for this task:</strong> " + esc(keyStep) + "</p>" +
      (c.finished && !c.passed ? '<p><button type="button" id="try-again-btn" class="primary">Try this task again</button></p>' : "");
    if ($("try-again-btn")) $("try-again-btn").addEventListener("click", tryAgain);
  }

  // After "Show me how" on a task that has already ended unpassed, the same task is offered again at the same level.
  function tryAgain() {
    const c = cur();
    const t = task();
    holder().current = { taskId: t.id, task: t.generated ? t : null, started: true, hints: 0, attempts: 0, showHow: c.showHow,
      finished: false, passed: false, draft: initialDraft(t) };
    eachLog((entry) => { entry.timesSet += 1; entry.lastResult = "in progress"; });
    notice = null;
    skipArmed = false;
    resetArmed = false;
    save();
    renderTask();
    $("task").focus();
  }

  // ---------- "This is too easy" / "This is way too hard" ----------
  const LEVEL_BUTTON_LABELS = { "too-easy": "This is too easy", "too-hard": "This is way too hard" };

  function renderLevelButtons() {
    const host = $("level-buttons");
    if (!host) return;
    const s = us();
    host.innerHTML = Object.keys(LEVEL_BUTTON_LABELS).map((b) => {
      const used = !!(s.buttonsUsed || {})[b];
      const available = levelButtonAvailable(s, b);
      let text = LEVEL_BUTTON_LABELS[b];
      if (used) text += " · Used for this unit";
      else if (!available) text += b === "too-easy" ? " · You're at the top level" : " · You're at Level 1";
      return '<button type="button" class="secondary level-btn" data-button="' + b + '"' + (available && !busy ? "" : " disabled") + ">" + esc(text) + "</button>";
    }).join("");
  }

  async function useLevelButton(button) {
    if (serving) return;
    const t = task();
    const r = pressLevelButton({ state: us(), button, studentId: student.id, unitId, taskId: t.id, store: Store });
    if (!r) return;
    // The current task is set aside: it counts as neither a pass nor a fail.
    eachLog((entry) => { if (entry.lastResult === "in progress") entry.lastResult = "set aside"; });
    notice = { kind: "up", text: r.message };
    renderSide();
    if (!(await serveNewTask())) return;
    renderTask();
    $("task").focus();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button.level-btn");
    if (b && !b.disabled) useLevelButton(b.dataset.button);
  });

  function renderHints() {
    const t = task();
    $("hints").innerHTML = t.hints.slice(0, cur().hints).map((h, i) =>
      "<li><strong>Hint " + (i + 1) + ":</strong> " + esc(h) + "</li>").join("");
  }

  function showHint() {
    const c = cur();
    const t = task();
    if ((c.finished && !inAssignment) || c.hints >= Math.min(MAX_HINTS_PER_TASK, t.hints.length)) return;
    c.hints += 1;
    eachLog((entry) => { entry.hintsUsed += 1; });
    save();
    renderHints();
    renderButtons();
    const items = $("hints").querySelectorAll("li");
    if (items.length) { items[items.length - 1].setAttribute("tabindex", "-1"); items[items.length - 1].focus(); }
  }

  async function nextTask() {
    if (serving) return;
    const c = cur();
    const t = task();
    if (inAssignment) { // moving on records nothing: the task stays as it is, to come back to
      openAssignmentTask(work.index + 1);
      return;
    }
    if (!c.finished) {
      if (!skipArmed) { skipArmed = true; resetArmed = false; renderButtons(); return; }
      if (c.placement) {
        recordAttempt(t, c, { kind: "skip", result: "skipped" });
        finishPlacementStep(false);
      } else {
        const levels = finishTask(false);
        recordAttempt(t, c, { kind: "skip", result: "skipped", levels });
      }
    }
    renderSide();
    if (c.placement && inPlacement()) await servePlacementTask();
    else {
      if (c.placement) {
        // Placement just finished: show the result once, then straight into practice.
        const start = us().placement.startLevel;
        notice = { kind: "up", text: "Quick check done – thank you! You'll start at Level " + start + " (" + levelName(start, unitId) + ")." };
      }
      if (!(await serveNewTask())) return;
    }
    renderSide();
    renderTask();
    $("task").focus();
  }

  function openAssignmentTask(i) {
    if (busy || !serveAssignmentTask(i)) return;
    notice = null;
    renderSide();
    renderTask();
    $("task").focus();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("button[data-assignment-task]");
    if (b && inAssignment) openAssignmentTask(+b.dataset.assignmentTask);
  });

  function setBusy(on, label) {
    busy = on;
    renderButtons();
    if (on) $("results").innerHTML = '<p class="running">' + esc(label) + "</p>";
  }

  function renderFinishedMessage() {
    const c = cur();
    const t = task();
    if (t.type === "predict") return; // predict shows its own result
    const box = document.createElement("p");
    box.className = c.passed ? "notice notice-up" : "notice notice-down";
    if (c.placement) box.textContent = c.passed ? "Well done! Press Next when you're ready." : "This one was tricky – that's fine. Press Next to move on.";
    else box.textContent = c.passed ? "You've completed this task. Press Next task when you're ready." : "This task was not passed.";
    $("results").prepend(box);
  }

  // ---------- Building code from each task type ----------
  // Returns { code }, { problem } (not checked, e.g. some blanks still empty), or, when checking (forCheck),
  // { empty: true } if nothing at all has been given: that counts as a failed NO_ANSWER attempt.
  function buildCode(forCheck) {
    const t = task();
    const d = cur().draft;
    if (t.type === "fill") {
      if (forCheck && d.blanks.every((b) => !b.trim())) return { empty: true, code: "" };
      if (d.blanks.some((b) => !b.trim())) return { problem: "Fill in every blank before checking." };
      const parts = t.starter.split("____");
      return { code: parts.reduce((acc, part, i) => acc + d.blanks[i - 1] + part) };
    }
    if (t.type === "parsons") {
      if (!d.program.length) return forCheck ? { empty: true, code: "" } : { problem: "Move some lines into 'Your program' first." };
      return { code: d.program.map((l) => " ".repeat(4 * (l.indent || 0)) + l.text).join("\n") };
    }
    if (t.type === "partial-parsons") {
      if (d.choice == null) return forCheck ? { empty: true, code: "" } : { problem: "Choose a line for the gap first." };
      return { code: withChosenLine(t, d.choice) };
    }
    if (t.type === "write" || t.type === "scratch") {
      if (!d.code.trim()) return forCheck ? { empty: true, code: "" } : { problem: "Write some code in the editor first." };
      return { code: d.code };
    }
    return { code: t.solution };
  }

  function showProblem(text) {
    $("results").innerHTML = '<p class="problem" role="alert">' + esc(text) + "</p>";
  }

  // ---------- Run (once, with the first test's inputs) ----------
  async function runOnce() {
    if (busy) return;
    const t = task();
    const built = buildCode();
    if (built.problem) return showProblem(built.problem);
    const inputs = t.tests[0].inputs;
    setBusy(true, "Running…");
    const results = await runner.run(built.code, [inputs]);
    setBusy(false);
    if (!results) return showProblem("Python couldn't be loaded, so your code can't run. Check your internet connection and reload the page.");
    const r = results[0];
    const err = Checker.explainError(r.error);
    $("results").innerHTML =
      '<h3>Output</h3><p class="inputs">' + esc(describeInputs(inputs)) + " (the example test's input)</p>" +
      '<pre class="output">' + showOutput(r.output) + "</pre>" +
      (err ? errorBox(err) : "");
  }

  function errorBox(err) {
    return '<div class="error-box"><strong>' + esc(err.title) + "</strong><p>" + esc(err.detail) + "</p></div>";
  }

  // ---------- Check (all tests) ----------
  async function check() {
    if (busy) return;
    const t = task();
    const c = cur();
    if (t.type === "predict") return checkPredict();
    if (t.type === "trace") return checkTrace();
    const built = buildCode(true);
    if (built.problem) return showProblem(built.problem);
    const counted = !c.finished; // re-checking a finished task isn't recorded

    if (counted) {
      c.attempts += 1;
      noteAttempt();
      save();
    }

    if (built.empty) {
      const failure = Checker.classifyAttempt({ type: t.type, empty: true });
      let more = "";
      if (counted) {
        recordAttempt(t, c, { result: "fail", failure, code: "" });
        if (c.placement) more = placementAfterFail() ? " You have one more try." : "";
      }
      $("results").innerHTML = failureHtml(t, failure, more.trim());
      renderButtons();
      if (c.finished) renderFinishedMessage();
      return;
    }

    setBusy(true, "Checking your code against " + t.tests.length + " tests…");
    const results = await runner.run(built.code, t.tests.map((x) => x.inputs));
    setBusy(false);
    if (!results) return showProblem("Python couldn't be loaded, so your code can't be checked. Check your internet connection and reload the page.");

    const passes = results.map((r, i) => !r.error && !r.notRun && Checker.outputsMatch(r.output, t.tests[i].expected));
    let extraProblem = "";
    let parsons = null;
    if (t.type === "parsons") {
      const d = c.draft;
      const usedDistractor = d.program.find((l) => l.id.startsWith("d"));
      const missing = d.available.some((l) => l.id.startsWith("s"));
      parsons = { usedDistractor: !!usedDistractor, missing };
      if (usedDistractor) extraProblem = "Your program uses a line that isn't needed: " + usedDistractor.text + " – move it back out.";
      else if (missing) extraProblem = "Some lines you need are still in 'Lines to use'.";
    }
    const allPass = passes.every(Boolean) && !extraProblem;
    const failure = allPass ? null : Checker.classifyAttempt({ type: t.type, code: built.code, results, tests: t.tests, passes, parsons });
    let tryAgain = "";
    if (counted && !allPass) {
      recordAttempt(t, c, { result: "fail", failure, code: built.code });
      if (c.placement) tryAgain = placementAfterFail() ? "You have one more try." : "";
    }
    renderResults(results, passes, extraProblem, allPass, failure, tryAgain);
    if (!allPass) renderButtons(); // "Show me how" may be available now

    if (allPass && counted) {
      if (c.placement) {
        recordAttempt(t, c, { result: "pass" });
        finishPlacementStep(true);
      } else {
        const levels = finishTask(true);
        recordAttempt(t, c, { result: "pass", levels });
      }
      renderButtons();
      if (notice && !c.placement) $("results").insertAdjacentHTML("afterbegin", '<p class="notice notice-' + notice.kind + '">' + esc(notice.text) + "</p>");
      $("next-btn").focus();
    } else if (c.finished) {
      renderButtons();
      if (counted) renderFinishedMessage(); // the last placement try was used
    }
  }

  function renderResults(results, passes, extraProblem, allPass, failure, tryAgain) {
    const t = task();
    const passCount = passes.filter(Boolean).length;
    let html = "";
    if (allPass) html += '<p class="success">✓ Well done – all ' + results.length + " tests passed!</p>";
    else html += "<h3>" + passCount + " of " + results.length + " tests passed</h3>";
    if (failure) html += failureHtml(t, failure, tryAgain);
    if (extraProblem && !(failure && failure.details && failure.details.parsons)) html += '<p class="problem">' + esc(extraProblem) + "</p>";

    // A syntax error stops every test the same way – explain it once.
    const first = results[0] && results[0].error;
    const sameSyntaxError = first && /SyntaxError|IndentationError|TabError/.test(first.type);
    if (sameSyntaxError) {
      html += errorBox(Checker.explainError(first));
      $("results").innerHTML = html;
      return;
    }

    html += '<ul class="test-results">';
    results.forEach((r, i) => {
      const test = t.tests[i];
      // Hidden tests: only whether they passed. Their inputs, expected output and the student's output for them
      // are never shown, so a hidden test can't be read off the screen.
      if (TaskView.isHidden(i)) {
        const label = "Hidden test " + (i + 1 - TaskView.EXAMPLE_TESTS);
        if (passes[i]) { html += '<li class="pass"><span class="mark" aria-hidden="true">✓</span> <strong>' + label + " passed</strong></li>"; return; }
        html += '<li class="fail"><span class="mark" aria-hidden="true">✗</span> <strong>' + label + (r.notRun ? " not run" : " didn't pass") + "</strong>";
        if (r.notRun) html += "<p>This test didn't run because an earlier test was stopped.</p>";
        else if (r.error) html += errorBox(Checker.explainError(r.error));
        else html += '<p class="tip">Your program works for the example, but not for this input. Check every branch and the boundaries.</p>';
        html += "</li>";
        return;
      }
      if (passes[i]) {
        html += '<li class="pass"><span class="mark" aria-hidden="true">✓</span> <strong>Example test passed</strong> <span class="inputs">' + esc(describeInputs(test.inputs)) + "</span></li>";
        return;
      }
      html += '<li class="fail"><span class="mark" aria-hidden="true">✗</span> <strong>Example test' + (r.notRun ? " not run" : " didn't pass") + "</strong>";
      if (r.notRun) { html += " <span class=\"inputs\">" + esc(describeInputs(test.inputs)) + "</span><p>This test didn't run because an earlier test was stopped.</p></li>"; return; }
      // Input, expected output and actual output, each on its own labelled line.
      html += '<dl class="io-lines">' +
        "<dt>Input</dt><dd>" + esc(inputsText(test.inputs)) + "</dd>" +
        "<dt>Expected</dt><dd><pre>" + showOutput(test.expected) + "</pre></dd>" +
        "<dt>Your output</dt><dd><pre>" + showOutput(r.output) + "</pre></dd></dl>";
      if (r.error) html += errorBox(Checker.explainError(r.error));
      else {
        let tip = Checker.mismatchHint(r.output, test.expected);
        if (r.inputsLeft > 0) tip += " (Your program didn't use all of the inputs.)";
        html += '<p class="tip">' + esc(tip) + "</p>";
      }
      html += "</li>";
    });
    html += "</ul>";
    $("results").innerHTML = html;
  }

  // ---------- Fill in the blanks ----------
  function fillBody(t, c) {
    const parts = t.starter.split("____");
    let html = '<pre class="code fill-code">' + highlight(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      const val = c.draft.blanks[i - 1] || "";
      html += '<input type="text" class="blank" data-i="' + (i - 1) + '" value="' + esc(val) + '" aria-label="Blank ' + i + '" spellcheck="false" autocomplete="off" autocapitalize="off" style="width:' + Math.max(5, val.length + 2) + 'ch">' + highlight(parts[i]);
    }
    return html + "</pre>";
  }

  function wireFill(c) {
    document.querySelectorAll(".blank").forEach((input) => {
      input.addEventListener("input", () => {
        c.draft.blanks[+input.dataset.i] = input.value;
        input.style.width = Math.max(5, input.value.length + 2) + "ch";
        save();
      });
    });
  }

  // ---------- Write ----------
  function writeBody(t, c) {
    return '<label for="editor" class="editor-label">Your code</label>' +
      '<textarea id="editor" class="editor" spellcheck="false" autocomplete="off" autocapitalize="off" rows="12" aria-describedby="editor-help">' + esc(c.draft.code) + "</textarea>" +
      '<p id="editor-help" class="small">Tab indents by 4 spaces. Press Esc then Tab to leave the editor. Ctrl+Enter checks your answer.</p>';
  }

  function wireWrite(c) {
    const ta = $("editor");
    if (typeof CodeMirror === "function") return wireCodeMirror(ta, c);
    // Fallback: the plain text box, if CodeMirror couldn't be loaded from the CDN.
    let escPressed = false;
    // execCommand keeps the browser's undo history; setRangeText is the fallback.
    const insert = (text) => {
      const ok = text ? document.execCommand("insertText", false, text) : document.execCommand("delete");
      if (!ok) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
    };
    ta.addEventListener("input", () => { c.draft.code = ta.value; save(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { escPressed = true; return; }
      if (e.key === "Tab" && !escPressed) {
        e.preventDefault();
        const lineStart = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
        if (e.shiftKey) {
          const spaces = /^ {0,4}/.exec(ta.value.slice(lineStart))[0].length;
          if (spaces) {
            const pos = ta.selectionStart;
            ta.setSelectionRange(lineStart, lineStart + spaces);
            insert("");
            ta.setSelectionRange(Math.max(lineStart, pos - spaces), Math.max(lineStart, pos - spaces));
          }
        } else insert("    ");
        ta.dispatchEvent(new Event("input"));
      } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        const lineStart = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
        const line = ta.value.slice(lineStart, ta.selectionStart);
        let indent = /^ */.exec(line)[0];
        if (/:\s*(#.*)?$/.test(line)) indent += "    ";
        insert("\n" + indent);
        ta.dispatchEvent(new Event("input"));
      }
      if (e.key !== "Shift") escPressed = false;
    });
  }

  // CodeMirror 5: Python highlighting, line numbers, matching brackets.
  // Tab inserts 4 spaces; Enter keeps the indent and adds a level after a colon (Python mode).
  // Esc then Tab leaves the editor, as in the plain text box.
  function wireCodeMirror(ta, c) {
    let escPressed = false;
    // CodeMirror.Pass would only hand Tab to CodeMirror's own keymap (which indents), so move focus ourselves.
    const visible = (el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true }) : el.offsetParent !== null);
    const leaveEditor = (cm, dir) => {
      const input = cm.getInputField();
      const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el === input || (!el.closest(".CodeMirror") && visible(el)));
      // Try each element in turn until one takes focus (some can't, e.g. inside a closed <details>).
      for (let i = focusable.indexOf(input) + dir; i >= 0 && i < focusable.length; i += dir) {
        focusable[i].focus();
        if (document.activeElement === focusable[i]) return;
      }
    };
    const indentOrLeave = (dir) => (cm) => {
      if (escPressed) { escPressed = false; leaveEditor(cm, dir); return undefined; }
      if (dir < 0 || cm.somethingSelected()) cm.indentSelection(dir < 0 ? "subtract" : "add");
      else cm.replaceSelection("    ", "end");
      return undefined;
    };
    const cm = CodeMirror.fromTextArea(ta, {
      mode: { name: "python", version: 3 },
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      smartIndent: true,
      matchBrackets: true,
      viewportMargin: Infinity,
      extraKeys: {
        Tab: indentOrLeave(1),
        "Shift-Tab": indentOrLeave(-1),
        Esc: () => { escPressed = true; },
      },
    });
    cm.on("keydown", (_, e) => { if (!["Escape", "Tab", "Shift"].includes(e.key)) escPressed = false; });
    cm.on("change", () => { c.draft.code = cm.getValue(); save(); });
    const input = cm.getInputField();
    input.setAttribute("aria-label", "Your code");
    input.setAttribute("aria-describedby", "editor-help");
    document.querySelector('label[for="editor"]').addEventListener("click", () => cm.focus());
    activeEditor = cm;
  }

  // ---------- Predict ----------
  function predictBody(t, c) {
    const inputs = t.tests[0].inputs;
    let html = '<pre class="code">' + highlight(t.solution) + "</pre>";
    if (inputs.length) html += '<p class="inputs-note">When this program runs, the user types: ' + inputs.map((v) => "<kbd>" + esc(v) + "</kbd>").join(" then ") + "</p>";
    html += '<fieldset class="options"><legend>What will it print?</legend>';
    t.options.forEach((opt, i) => {
      const checked = c.draft.choice === i ? " checked" : "";
      const disabled = c.finished ? " disabled" : "";
      let cls = "option";
      if (c.finished && i === t.answer) cls += " correct";
      else if (c.finished && i === c.draft.choice) cls += " wrong";
      html += '<label class="' + cls + '"><input type="radio" name="predict" value="' + i + '"' + checked + disabled + ">" +
        '<pre>' + showOutput(opt) + "</pre></label>";
    });
    return html + "</fieldset>";
  }

  function wirePredict(t, c) {
    document.querySelectorAll('input[name="predict"]').forEach((r) => {
      r.addEventListener("change", () => { c.draft.choice = +r.value; save(); });
    });
    if (c.finished) showPredictResult(null);
  }

  async function checkPredict() {
    const t = task();
    const c = cur();
    if (c.finished) return;
    if (c.draft.choice == null) return showProblem("Choose the output you think it will print first.");
    c.attempts += 1;
    noteAttempt();
    const correct = c.draft.choice === t.answer;
    const failure = correct ? null : Checker.classifyAttempt({ type: "predict", choice: c.draft.choice, options: t.options, answer: t.answer });
    if (inAssignment && !correct) {
      // Unlimited tries: the answer isn't shown, so the student can think again and choose another option.
      recordAttempt(t, c, { result: "fail", failure, code: "" });
      save();
      $("results").innerHTML = failureHtml(t, failure) + '<p class="small">Have another go: choose again, then press the button.</p>';
      renderButtons();
      return;
    }
    if (c.placement) {
      recordAttempt(t, c, correct ? { result: "pass" } : { result: "fail", failure, code: "" });
      if (!correct && placementAfterFail()) {
        // A second try on placement: the answer isn't revealed yet.
        save();
        showProblem("Not quite – you have one more try. Look at the program again.");
        return;
      }
      if (correct) finishPlacementStep(true);
    } else {
      const levels = finishTask(correct);
      recordAttempt(t, c, correct ? { result: "pass", levels } : { result: "fail", failure, code: "", levels });
    }
    renderTask();
    setBusy(true, "Running the program…");
    const results = await runner.run(t.solution, [t.tests[0].inputs]);
    setBusy(false);
    showPredictResult(results ? results[0].output : null);
    $("next-btn").focus();
  }

  function showPredictResult(actual) {
    const t = task();
    const c = cur();
    const output = actual == null ? t.options[t.answer] : actual;
    let html = c.passed
      ? '<p class="success">✓ Correct – your prediction matched!</p>'
      : c.draft.choice == null
        ? '<p class="problem">Not quite. Compare your choice with what the program really printed, and trace through the code line by line.</p>'
        : failureHtml(t, Checker.classifyAttempt({ type: "predict", choice: c.draft.choice, options: t.options, answer: t.answer }));
    html += "<h3>The program printed</h3><pre class=\"output\">" + showOutput(output) + "</pre>";
    $("results").innerHTML = html;
  }

  // ---------- Program with line numbers (trace tables refer to lines by number) ----------
  function numberedCode(code) {
    const lines = code.split("\n");
    const w = String(lines.length).length;
    return '<pre class="code numbered">' + lines.map((l, i) => '<span class="ln" aria-hidden="true">' + String(i + 1).padStart(w, " ") + "</span>" + highlight(l)).join("\n") + "</pre>";
  }

  // ---------- Trace table ----------
  // table = a task's trace (Checker.traceTable). cells = the student's answers ("row:column" → text), or null for a
  // finished example. readOnly: every cell is shown as text (the "Show me how" example).
  function traceTableHtml(table, cells, readOnly, marks) {
    const asked = new Set(readOnly ? [] : table.ask.map(([r, c]) => r + ":" + c));
    const wrong = new Set(marks || []);
    let html = '<div class="trace-wrap"><table class="trace-table"><thead><tr>' +
      table.columns.map((col) => '<th scope="col">' + esc(col) + "</th>").join("") + "</tr></thead><tbody>";
    table.rows.forEach((row, r) => {
      html += "<tr>" + row.map((v, c) => {
        const k = r + ":" + c;
        const col = table.columns[c];
        if (!asked.has(k)) return (c === 0 && col === "Line" ? '<th scope="row">' : "<td>") + (v == null ? "" : esc(v)) + (c === 0 && col === "Line" ? "</th>" : "</td>");
        const val = (cells || {})[k] || "";
        return '<td><input type="text" class="trace-cell' + (wrong.has(k) ? " wrong" : "") + '" data-k="' + k + '" value="' + esc(val) + '"' +
          ' aria-label="Row ' + (r + 1) + ", " + esc(col) + (wrong.has(k) ? " (not right yet)" : "") + '" spellcheck="false" autocomplete="off" autocapitalize="off"' +
          (cur() && cur().finished ? " disabled" : "") + "></td>";
      }).join("") + "</tr>";
    });
    return html + "</tbody></table></div>";
  }

  function traceBody(t, c) {
    const inputs = t.tests[0].inputs;
    return numberedCode(t.solution) +
      (inputs.length ? '<p class="inputs-note">When this program runs, the user types: ' + inputs.map((v) => "<kbd>" + esc(v === "" ? "Enter" : v) + "</kbd>").join(" then ") + "</p>" : "") +
      '<h3 class="trace-h">Your trace table</h3>' +
      '<p id="trace-help" class="small">Each row is one line that runs and changes something. Write the new value of each variable that line changes, and anything it prints in Output. Leave the other cells empty. Text doesn\'t need quotes (write "" for empty text).</p>' +
      '<div id="trace-host">' + traceTableHtml(t.trace, c.draft.cells, false, c.draft.marks) + "</div>";
  }

  function wireTrace(c) {
    document.querySelectorAll(".trace-cell").forEach((input) => {
      input.setAttribute("aria-describedby", "trace-help");
      input.addEventListener("input", () => {
        c.draft.cells[input.dataset.k] = input.value;
        if (input.classList.contains("wrong")) {
          input.classList.remove("wrong");
          c.draft.marks = (c.draft.marks || []).filter((k) => k !== input.dataset.k);
        }
        save();
      });
    });
  }

  async function checkTrace() {
    const t = task();
    const c = cur();
    const counted = !c.finished;
    const g = Checker.gradeTrace(t.trace, c.draft.cells);
    if (counted) { c.attempts += 1; noteAttempt(); }
    const failure = g.passed ? null : Checker.classifyAttempt({ type: "trace", table: t.trace, cells: c.draft.cells });
    let more = "";
    if (counted && !g.passed) {
      recordAttempt(t, c, { result: "fail", failure, code: Checker.traceAnswerText(t.trace, c.draft.cells) });
      if (c.placement) more = placementAfterFail() ? "You have one more try." : "";
    }
    // Wrong cells are marked (not in placement, where only the count is given).
    c.draft.marks = !g.passed && !c.placement ? g.wrong.map(([r, k]) => r + ":" + k) : [];
    save();
    // Redrawn once the result is recorded, so a finished task's cells can't be changed.
    const redraw = () => { $("trace-host").innerHTML = traceTableHtml(t.trace, c.draft.cells, false, c.draft.marks); wireTrace(c); };
    if (g.passed) {
      $("results").innerHTML = '<p class="success">✓ Well done – every cell of your trace table is right!</p>';
      if (counted) {
        if (c.placement) { recordAttempt(t, c, { result: "pass" }); finishPlacementStep(true); }
        else { const levels = finishTask(true); recordAttempt(t, c, { result: "pass", levels }); }
        if (notice && !c.placement) $("results").insertAdjacentHTML("afterbegin", '<p class="notice notice-' + notice.kind + '">' + esc(notice.text) + "</p>");
      }
      redraw();
      renderButtons();
      $("next-btn").focus();
      return;
    }
    redraw();
    $("results").innerHTML = failureHtml(t, failure, more.trim()) +
      (c.draft.marks.length ? '<p class="small">The cells that aren\'t right yet are marked in the table.</p>' : "");
    renderButtons();
    if (c.finished && counted) renderFinishedMessage();
  }

  // ---------- Pick the missing line (partial Parsons) ----------
  // The starter has one line "____" (with its indentation): the chosen option goes there.
  const withChosenLine = (t, i) => t.starter.replace(/^( *)____[ \t]*$/m, (m, ind) => ind + t.options[i]);

  function partialCode(t, c) {
    const lines = t.starter.split("\n");
    return '<pre class="code partial-code">' + lines.map((l) => {
      const m = /^( *)____[ \t]*$/.exec(l);
      if (!m) return highlight(l);
      const chosen = c.draft.choice == null ? null : t.options[c.draft.choice];
      return m[1] + '<span class="gap' + (chosen == null ? " empty" : "") + '" id="pp-gap">' + (chosen == null ? "? the missing line" : highlight(chosen)) + "</span>";
    }).join("\n") + "</pre>";
  }

  function partialBody(t, c) {
    let html = '<div id="pp-code">' + partialCode(t, c) + "</div>";
    html += '<fieldset class="options pp-options"><legend>Which line goes in the gap?</legend>';
    t.options.forEach((opt, i) => {
      html += '<label class="option"><input type="radio" name="pp" value="' + i + '"' + (c.draft.choice === i ? " checked" : "") + ">" +
        "<code>" + highlight(opt) + "</code></label>";
    });
    return html + "</fieldset>";
  }

  function wirePartial(t, c) {
    document.querySelectorAll('input[name="pp"]').forEach((r) => {
      r.addEventListener("change", () => {
        c.draft.choice = +r.value;
        save();
        $("pp-code").innerHTML = partialCode(t, c);
      });
    });
  }

  // ---------- Parsons ----------
  let parsonsFocusId = null;
  let dragId = null;

  function parsonsBody() {
    return '<p id="parsons-help" class="small">Click a line (or press Enter) to move it into your program. Use the arrow buttons, or Alt+↑/↓ to reorder and ←/→ to indent. Press Enter or Delete on a line in your program to remove it.</p>' +
      '<div class="parsons">' +
        '<div class="parsons-col"><h3 id="avail-h">Lines to use</h3><ul id="p-avail" class="p-list" aria-labelledby="avail-h"></ul></div>' +
        '<div class="parsons-col"><h3 id="prog-h">Your program</h3><ul id="p-prog" class="p-list program" aria-labelledby="prog-h"></ul></div>' +
      "</div>";
  }

  function renderParsons() {
    const d = cur().draft;
    const lineHtml = (l, inProgram) => {
      const indent = inProgram ? l.indent || 0 : 0;
      const label = esc(l.text) + (inProgram ? ", indent " + indent : "");
      let html = '<li class="p-line" tabindex="0" draggable="true" data-id="' + l.id + '" aria-label="' + label + '" aria-describedby="parsons-help">' +
        '<code style="padding-left:' + indent * 2.5 + 'ch">' + highlight(l.text) + "</code>";
      if (inProgram) {
        html += '<span class="p-btns">' +
          '<button type="button" tabindex="-1" data-act="out" aria-label="Indent less">◀</button>' +
          '<button type="button" tabindex="-1" data-act="in" aria-label="Indent more">▶</button>' +
          '<button type="button" tabindex="-1" data-act="up" aria-label="Move up">▲</button>' +
          '<button type="button" tabindex="-1" data-act="down" aria-label="Move down">▼</button>' +
          '<button type="button" tabindex="-1" data-act="remove" aria-label="Remove">✕</button></span>';
      }
      return html + "</li>";
    };
    $("p-avail").innerHTML = d.available.map((l) => lineHtml(l, false)).join("") ||
      '<li class="p-empty">All lines used</li>';
    $("p-prog").innerHTML = d.program.map((l) => lineHtml(l, true)).join("") ||
      '<li class="p-empty">Move lines here</li>';
    if (parsonsFocusId) {
      const el = document.querySelector('.p-line[data-id="' + parsonsFocusId + '"]');
      if (el) el.focus();
      parsonsFocusId = null;
    }
  }

  function findLine(id) {
    const d = cur().draft;
    let i = d.available.findIndex((l) => l.id === id);
    if (i >= 0) return { list: d.available, index: i, inProgram: false };
    i = d.program.findIndex((l) => l.id === id);
    return { list: d.program, index: i, inProgram: true };
  }

  function parsonsAction(id, act, toIndex) {
    const d = cur().draft;
    const { list, index, inProgram } = findLine(id);
    if (index < 0) return;
    const line = list[index];
    if (act === "toggle") act = inProgram ? "remove" : "add";
    if (act === "add") {
      list.splice(index, 1);
      line.indent = 0;
      d.program.splice(toIndex == null ? d.program.length : toIndex, 0, line);
    } else if (act === "remove") {
      list.splice(index, 1);
      delete line.indent;
      d.available.splice(toIndex == null ? d.available.length : toIndex, 0, line);
    } else if (act === "move") {
      list.splice(index, 1);
      list.splice(Math.min(toIndex, list.length), 0, line);
    } else if (act === "up" && index > 0) {
      list.splice(index - 1, 0, list.splice(index, 1)[0]);
    } else if (act === "down" && index < list.length - 1) {
      list.splice(index + 1, 0, list.splice(index, 1)[0]);
    } else if (act === "in" && inProgram) {
      line.indent = Math.min(4, (line.indent || 0) + 1);
    } else if (act === "out" && inProgram) {
      line.indent = Math.max(0, (line.indent || 0) - 1);
    }
    parsonsFocusId = id;
    save();
    renderParsons();
  }

  document.addEventListener("click", (e) => {
    const lineEl = e.target.closest && e.target.closest(".p-line");
    if (!lineEl) return;
    const btn = e.target.closest("button[data-act]");
    if (btn) parsonsAction(lineEl.dataset.id, btn.dataset.act);
    else if (lineEl.closest("#p-avail")) parsonsAction(lineEl.dataset.id, "add");
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && $("check-btn") && !$("check-btn").disabled) {
      e.preventDefault();
      check();
      return;
    }
    const lineEl = e.target.classList && e.target.classList.contains("p-line") ? e.target : null;
    if (!lineEl) return;
    const id = lineEl.dataset.id;
    const inProgram = !!lineEl.closest("#p-prog");
    let handled = true;
    if (e.key === "Enter" || e.key === " ") parsonsAction(id, "toggle");
    else if ((e.key === "Delete" || e.key === "Backspace") && inProgram) parsonsAction(id, "remove");
    else if (e.altKey && e.key === "ArrowUp") parsonsAction(id, "up");
    else if (e.altKey && e.key === "ArrowDown") parsonsAction(id, "down");
    else if (e.key === "ArrowUp" && lineEl.previousElementSibling) lineEl.previousElementSibling.focus();
    else if (e.key === "ArrowDown" && lineEl.nextElementSibling) lineEl.nextElementSibling.focus();
    else if (e.key === "ArrowRight" && inProgram) parsonsAction(id, "in");
    else if (e.key === "ArrowLeft" && inProgram) parsonsAction(id, "out");
    else handled = false;
    if (handled) e.preventDefault();
  });

  // Drag and drop (mouse) – keyboard and buttons do the same job.
  document.addEventListener("dragstart", (e) => {
    const lineEl = e.target.closest && e.target.closest(".p-line");
    if (!lineEl) return;
    dragId = lineEl.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  document.addEventListener("dragover", (e) => {
    if (dragId && e.target.closest && e.target.closest(".p-list")) e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    const listEl = e.target.closest && e.target.closest(".p-list");
    if (!dragId || !listEl) return;
    e.preventDefault();
    const items = [...listEl.querySelectorAll(".p-line")].filter((li) => li.dataset.id !== dragId);
    let toIndex = items.findIndex((li) => { const r = li.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (toIndex < 0) toIndex = items.length;
    const { inProgram } = findLine(dragId);
    const toProgram = listEl.id === "p-prog";
    parsonsAction(dragId, toProgram === inProgram ? "move" : toProgram ? "add" : "remove", toIndex);
    dragId = null;
  });
  document.addEventListener("dragend", () => { dragId = null; });

  // ---------- Reset ----------
  $("reset-btn").addEventListener("click", () => { $("reset-confirm").hidden = false; $("reset-yes").focus(); });
  $("reset-no").addEventListener("click", () => { $("reset-confirm").hidden = true; $("reset-btn").focus(); });
  $("reset-yes").addEventListener("click", async () => {
    if (serving) return;
    const old = us();
    const before = old.level;
    // The placement result, the level buttons used and a level 10 pass are kept: only a teacher can reset placement.
    // Passed tasks and failed-attempt counts are kept too, so a passed task is still never served again.
    const start = old.placement && old.placement.status === "done" ? old.placement.startLevel : START_LEVEL;
    progress.units[unitId] = Object.assign(freshUnitState(start), { placement: old.placement || null, buttonsUsed: old.buttonsUsed || {}, passedTop: !!old.passedTop,
      passedFingerprints: old.passedFingerprints || {}, failedAttempts: old.failedAttempts || {}, failedVariants: old.failedVariants || {} });
    if (before !== start) Store.logLevelChange({ studentId: student.id, unit: unitId, from: before, to: start, reason: "reset" });
    notice = null;
    $("reset-confirm").hidden = true;
    renderSide();
    if (!(await serveNewTask())) return;
    renderTask();
    $("task").focus();
  });

  // ---------- Start up ----------
  const loadJson = (file) => fetch(file).then((r) => { if (!r.ok) throw new Error(file); return r.json(); });
  Promise.all([
    loadJson("tasks.json"),
    loadJson("templates.json").catch(() => []), // without templates, practice still works from the task bank
    loadJson("misconceptions.json").catch(() => []), // without it, failures just don't show a misconception's explanation
  ])
    .then(async ([data, tpls, mis]) => {
      tasks = data;
      templates = tpls;
      misconceptionById = Object.fromEntries(mis.map((m) => [m.id, m]));
      taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
      // Saved progress from earlier versions: renamed skills, removed duplicate tasks, and the new fields.
      if (migrateProgress(progress, { tasks, templates, attempts: Store.attempts(student.id), Templates }) && !inAssignment) save();
      ensureSkillStates(progress, (id) => taskById[id]);
      if (inAssignment) {
        resolveAssignmentTasks();
        if (!assignment || !assignmentTasks.length) {
          $("unit-levels").innerHTML = "";
          $("task").innerHTML = '<p class="problem">' + (assignment ? "This assignment has no tasks yet." : "This assignment is closed, or it couldn't be found.") +
            ' <a href="app.html">Back to your units</a></p>';
          return;
        }
        const open = work.current && assignmentTasks.findIndex((t) => t.id === work.current.taskId);
        if (open == null || open < 0) { work.current = null; serveAssignmentTask(0); } else work.index = open;
        renderSide();
        renderTask();
        return;
      }
      if (!endless && !tasks.some((t) => t.unit === unitId)) { location.replace("app.html"); return; }
      // Keep the task in progress if it still makes sense here.
      const c = holder().current;
      const t = c && (c.task || taskById[c.taskId]);
      renderSide();
      if (inPlacement()) {
        const p = us().placement;
        const onStep = c && c.placement && t && p.status === "in-progress" && c.taskId === p.taskIds[p.step];
        if (!onStep) await servePlacementTask();
      } else {
        // A finished placement task stays on screen until Next is pressed.
        const fits = t && (endless ? unitsOf(t).every((u) => progress.endless.units.includes(u)) : unitsOf(t).includes(unitId)) &&
          (!c.placement || c.finished);
        if (!fits && !(await serveNewTask())) return;
      }
      renderSide();
      renderTask();
    })
    .catch((e) => {
      if (typeof console !== "undefined") console.error(e);
      $("task").innerHTML = '<p class="problem">Couldn\'t load the tasks. Open this site through a local web server (see README.md) rather than double-clicking the file.</p>';
    });
});
