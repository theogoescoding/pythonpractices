// Certificates: a student earns one for a block of units once every unit in it has its floor at 100%.
// One rule, used by the teacher view in local mode (teacher-data.js) and by the server (teacher-api, through
// supabase/functions/_shared/certificates-server.js), so both always agree. No DOM here: tests/features.js checks it.
//   - Blocks: the six on the Students page, the curriculum's unit groups with A-level split into its two parts.
//   - A unit's floor is secured.js's (score().floor): 50% when first secured, 10 points higher each time the unit comes
//     back to 100% after dropping, up to 100%. secured.js's rules are used as they are, never changed here.
//   - A block is earned when every unit in it has reached a floor of 100%. A unit never secured has no floor at 100%.
//     The old Validation unit (Curriculum.OLD_UNITS) counts only for a student who has started it: the others never
//     see it, so it can't stop them earning the Validation certificate.
//   - The earned date is the date the last of the block's units reached a floor of 100%: for each unit, the first
//     level 10 pass (with no hints) after which score() gives a floor of 100%, worked out from the stored attempts.
//     The date is the day in the UK (Europe/London), so a pass just after midnight counts for that day.
//   - Once earned, a certificate is kept (the server and local mode store it; a floor never goes down anyway).

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./secured.js"), require("./curriculum.js"));
  else root.Certificates = factory(root.Secured, root.Curriculum);
})(typeof self !== "undefined" ? self : this, function (Secured, Curriculum) {
  const TITLE = "Pythons and Ladders";
  // [{ id, name, units }]: Programming fundamentals, Advanced programming, Validation, Searching and sorting,
  // A-level: Programming techniques, A-level: Data structures (the Students page's block headings).
  const BLOCKS = Curriculum.UNIT_GROUPS.reduce((all, g) => all.concat((g.subsections || [g]).map((part) => ({
    id: part.id, name: part === g ? g.title : g.title + ": " + part.title, units: part.units.slice(),
  }))), []);
  const blockById = (id) => BLOCKS.find((b) => b.id === id) || null;

  // "YYYY-MM-DD" of a moment, in the UK.
  const UK_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const ukDate = (ms) => UK_DATE.format(new Date(ms));

  // When a unit's floor reached 100% (ms), or null if it hasn't. Asks secured.js's score() at each level 10 pass.
  function floorFullAt(attempts, unit) {
    const passes = (attempts || []).filter((a) => Secured.isTopPass(a, unit));
    const times = passes.map((a) => Date.parse(a.at)).filter((t) => Number.isFinite(t)).sort((x, y) => x - y);
    for (const t of times) if (Secured.score(passes, unit, t).floor >= Secured.FLOOR_CAP) return t;
    return null;
  }

  // The units of a block that count for this student. started(unit): whether they have started it (old units only).
  // started() from a student's saved progress and attempts, as their own pages decide it (Curriculum.hasStartedUnit).
  const startedFrom = (progress, attempts) => (u) => Curriculum.hasStartedUnit(u, progress, attempts);
  const unitsFor = (block, started) => block.units.filter((u) => !Curriculum.OLD_UNITS.includes(u) || (started ? !!started(u) : false));

  // A block for one student: { earned, at (ms, the last unit's), units: { unit: ms or null } }.
  function blockStatus(block, attempts, started) {
    const units = {};
    for (const u of unitsFor(block, started)) units[u] = floorFullAt(attempts, u);
    const times = Object.values(units);
    const earned = times.length > 0 && times.every((t) => t != null);
    return { earned, at: earned ? Math.max.apply(null, times) : null, units };
  }

  // Every block this student has earned, in the blocks' order: [{ block_id, block_name, earned_on: "YYYY-MM-DD" }].
  function earnedBlocks(attempts, started) {
    const out = [];
    for (const b of BLOCKS) {
      const s = blockStatus(b, attempts, started);
      if (s.earned) out.push({ block_id: b.id, block_name: b.name, earned_on: ukDate(s.at) });
    }
    return out;
  }

  // Keeps what was earned before and adds what is new: one certificate per block, the first earned date kept.
  // stored and computed: [{ block_id, block_name, earned_on }]. Returns them in the blocks' order.
  function merge(stored, computed) {
    const by = {};
    for (const c of (stored || []).concat(computed || [])) if (c && c.block_id && !by[c.block_id]) by[c.block_id] = c;
    const order = (id) => { const i = BLOCKS.findIndex((b) => b.id === id); return i < 0 ? BLOCKS.length : i; };
    return Object.values(by).sort((x, y) => order(x.block_id) - order(y.block_id));
  }

  // "5 November 2026" from "2026-11-05", as the certificate prints it.
  const longDate = (ymd) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return "";
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return Number(m[3]) + " " + months[Number(m[2]) - 1] + " " + m[1];
  };

  return { TITLE, BLOCKS, blockById, ukDate, floorFullAt, startedFrom, unitsFor, blockStatus, earnedBlocks, merge, longDate };
});
