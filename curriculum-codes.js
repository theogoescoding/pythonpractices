"use strict";

// OCR specification codes (prompt 28): teacher planning and Ofsted evidence only. Students never see them, and no
// export uses them. The codes are in curriculum-codes.json, the one data file: { specifications: { J277, H446:
// { name, version } }, units: [{ unit, specification, version, code, point, closestMatch?, matchNote? }] }, one entry
// for every unit in curriculum.js. This file shows them:
//   - the teacher view's Curriculum page: every unit, grouped by block, with a search box (teacher.js);
//   - its print page (curriculum-print.html): the whole table on one A4 landscape page;
//   - a small grey label under each unit's column heading on the Students page (teacher-data.js overviewTablesHtml).
// The rules need no DOM, so tests/features.js checks them in Node.
(function (root, factory) {
  const CurriculumCodes = factory();
  if (typeof module === "object" && module.exports) module.exports = CurriculumCodes;
  else root.CurriculumCodes = CurriculumCodes;
})(typeof self !== "undefined" ? self : this, function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const NO_MATCH = "No matching units";
  const CLOSEST = "Closest match: not named in the specification";

  // The entry of each unit: a Map (unit id -> entry).
  const byUnit = (data) => new Map(((data && data.units) || []).map((e) => [e.unit, e]));
  // "J277 2.2.1": the short label under a unit's column heading.
  const label = (e) => (e ? e.specification + " " + e.code : "");
  // The label as HTML, with its name for a screen reader: "Specification code J277 2.2.1".
  const labelHtml = (e) => (e ? '<span class="spec-code"><span class="visually-hidden">Specification code </span>' + esc(label(e)) + "</span>" : "");

  // The blocks of units, in the curriculum's order (the A-level group as its two parts, as on the Students page).
  const blocks = (Curriculum) => Curriculum.UNIT_GROUPS.flatMap((g) => (g.subsections && g.subsections.length
    ? g.subsections.map((s) => ({ title: g.title + ": " + s.title, units: s.units })) : [{ title: g.title, units: g.units }]));
  // One row per unit: { block, unit, name, specification, version, code, point, closestMatch, matchNote }.
  function rows(data, Curriculum) {
    const codes = byUnit(data);
    return blocks(Curriculum).flatMap((b) => b.units.map((u) => Object.assign({ block: b.title, unit: u, name: Curriculum.unitTitle(u) }, codes.get(u) || {})));
  }
  // A unit matches when what is typed is in its name, or in its code (with or without the specification): "loops",
  // "2.2.3", "J277 2.3", "h446". Capitals don't matter; nothing typed shows every unit.
  function search(list, query) {
    const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q) || (r.specification + " " + r.code).toLowerCase().includes(q));
  }

  // "OCR GCSE (9–1) Computer Science (J277), version 2.4" for each specification.
  const versions = (data) => Object.entries((data && data.specifications) || {}).map(([id, s]) => s.name + " (" + id + "), version " + s.version);
  // The table: a heading row for each block, then its units. Every value as text.
  function tableHtml(list) {
    if (!list.length) return '<p class="cc-none">' + NO_MATCH + ".</p>";
    const groups = [];
    for (const r of list) { if (!groups.length || groups[groups.length - 1].block !== r.block) groups.push({ block: r.block, rows: [] }); groups[groups.length - 1].rows.push(r); }
    return '<table class="cc-table"><caption class="visually-hidden">OCR specification codes for each unit</caption>' +
      '<thead><tr><th scope="col">Unit</th><th scope="col">Specification</th><th scope="col">Code</th><th scope="col">Specification point</th></tr></thead>' +
      groups.map((g) => '<tbody><tr class="cc-block"><th scope="colgroup" colspan="4">' + esc(g.block) + "</th></tr>" +
        g.rows.map((r) => '<tr><th scope="row">' + esc(r.name) + "</th><td>" + esc(r.specification + " (version " + r.version + ")") + '</td><td class="cc-code">' + esc(r.code) + "</td><td>" + esc(r.point) +
          (r.closestMatch ? ' <span class="cc-flag" title="' + esc(r.matchNote || CLOSEST) + '">' + CLOSEST + "</span>" : "") + "</td></tr>").join("") + "</tbody>").join("") + "</table>";
  }

  // What is wrong with the data, if anything: every unit exactly one entry, every entry a real unit, the specification
  // one of the two with its version, and a code and a specification point. -> [problem], empty when all is well.
  function problems(data, Curriculum) {
    const out = [];
    const ids = Curriculum.UNITS.map((u) => u.id);
    const entries = (data && data.units) || [];
    for (const id of ids) { const n = entries.filter((e) => e.unit === id).length; if (n !== 1) out.push(id + " has " + n + " entries"); }
    for (const e of entries) {
      if (!ids.includes(e.unit)) out.push(e.unit + " isn't a unit");
      const spec = ((data && data.specifications) || {})[e.specification];
      if (!spec) out.push(e.unit + ": unknown specification " + e.specification);
      else if (spec.version !== e.version) out.push(e.unit + ": version " + e.version + " isn't " + e.specification + "'s " + spec.version);
      if (!/^\d\.\d\.\d$/.test(e.code || "")) out.push(e.unit + ": code " + e.code);
      if (!e.point) out.push(e.unit + ": no specification point");
    }
    return out;
  }

  // The print page (curriculum-print.html): the whole table, then the print window when #print=1.
  if (typeof document !== "undefined" && typeof self !== "undefined" && self.document === document && document.getElementById("cc-print-page")) {
    fetch("curriculum-codes.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((data) => {
      document.getElementById("cc-versions").textContent = versions(data).join(" · ");
      document.getElementById("cc-table").innerHTML = tableHtml(rows(data, self.Curriculum));
      if (/(^|[#&])print=1/.test(location.hash)) setTimeout(() => window.print(), 300);
    }).catch(() => { document.getElementById("cc-table").textContent = "Couldn't load the specification codes."; });
  }

  return { NO_MATCH, CLOSEST, byUnit, label, labelHtml, blocks, rows, search, versions, tableHtml, problems };
});
