"use strict";

// The glossary (prompt 27). Its content is in glossary.json, the one data file: { groups, terms: [{ id, term, group,
// definition, example, match, exactCase }] }. This file:
//   - shows it on glossary.html: every term A to Z under its letter, with a search box that filters as you type;
//   - links terms in a task's text and hints on the practice page (app.js): the first mention of each term on a task
//     opens its entry, in a new tab so the task and its code stay as they are. Code, the editor and the test results
//     are never linked: only the description's first line (the rest is usually what the program prints) and the hints,
//     and never a word in "double quotes", a call such as range(, or part of a name such as self.name.
// It needs no server: the page and the links work the same in local mode. No DOM in the rules, so tests/features.js
// checks them in Node.
(function (root, factory) {
  const Glossary = factory();
  if (typeof module === "object" && module.exports) module.exports = Glossary;
  else root.Glossary = Glossary;
})(typeof self !== "undefined" ? self : this, function () {
  const PAGE = "glossary.html";
  const NO_MATCH = "No matching terms";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plain = (s) => String(s).replace(/`/g, ""); // a definition without its code marks
  const href = (id) => PAGE + "#term-" + id;

  // ---------- The list ----------
  // A to Z, ignoring capitals; a term starting with a digit ("2D array") comes first, under "#".
  const letterOf = (term) => { const c = term.trim().charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : "#"; };
  const sorted = (terms) => terms.slice().sort((a, b) => {
    const digitA = letterOf(a.term) === "#", digitB = letterOf(b.term) === "#";
    if (digitA !== digitB) return digitA ? -1 : 1;
    return a.term.localeCompare(b.term, "en-GB", { sensitivity: "base", numeric: true });
  });
  // [{ letter, terms }] in order.
  function byLetter(terms) {
    const out = [];
    for (const t of sorted(terms)) {
      const l = letterOf(t.term);
      if (!out.length || out[out.length - 1].letter !== l) out.push({ letter: l, terms: [] });
      out[out.length - 1].terms.push(t);
    }
    return out;
  }

  // ---------- Search ----------
  // A term matches when what is typed is the start of the term, or the start of any word in its definition (so "rem"
  // finds modulus, "the remainder after division"). Capitals don't matter; nothing typed shows every term.
  function search(terms, query) {
    const q = String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return sorted(terms);
    const wordStart = new RegExp("(^|[^a-z0-9])" + escRe(q));
    return sorted(terms.filter((t) => t.term.toLowerCase().startsWith(q) || wordStart.test(plain(t.definition).toLowerCase())));
  }

  // ---------- Links in task text and hints ----------
  // Every word that links to a term, longest first, in one pattern.
  function compile(data) {
    const terms = (data && data.terms) || [];
    const forms = [];
    for (const t of terms) for (const f of t.match || []) forms.push({ form: f, id: t.id, term: t.term, exact: !!t.exactCase, units: t.units || null, notUnits: t.notUnits || null });
    forms.sort((a, b) => b.form.length - a.form.length);
    const byLower = new Map(); // a Map, not an object: "constructor" is a term
    for (const f of forms) { const k = f.form.toLowerCase(); if (!byLower.has(k)) byLower.set(k, []); byLower.get(k).push(f); }
    return { forms, byLower, re: forms.length ? new RegExp(forms.map((f) => escRe(f.form)).join("|"), "gi") : null };
  }
  const wordChar = (c) => !!c && /[A-Za-z0-9_]/.test(c);
  // A term with a units list links only in those units, and never in its notUnits (glossary.json): its word often means
  // something else elsewhere (a school class, a variable called key, a return fare, a side length).
  const inUnits = (f, units) => (!f.units || (units || []).some((u) => f.units.includes(u))) && !(f.notUnits && (units || []).some((u) => f.notUnits.includes(u)));
  // Plain text as HTML, with the first mention of each term not in `used` linked (and added to `used`). units: the
  // task's units (no units given: every term may link).
  function linkText(text, compiled, used, units) {
    const s = String(text == null ? "" : text);
    if (!compiled || !compiled.re) return esc(s);
    const quoted = [];
    for (const q of s.matchAll(/"[^"\n]*"/g)) quoted.push([q.index, q.index + q[0].length]);
    const inQuotes = (i) => quoted.some(([a, b]) => i >= a && i < b);
    const re = new RegExp(compiled.re.source, "gi");
    let out = "", last = 0, m;
    while ((m = re.exec(s))) {
      const start = m.index, end = start + m[0].length;
      const before = s.charAt(start - 1), after = s.charAt(end);
      const codeLike = before === "." || after === "(" || after === "=" || (after === "." && wordChar(s.charAt(end + 1)));
      const f = (compiled.byLower.get(m[0].toLowerCase()) || []).find((x) => (!x.exact || x.form === m[0]) && (!units || inUnits(x, units)));
      if (wordChar(before) || wordChar(after) || codeLike || inQuotes(start) || !f) { re.lastIndex = start + 1; continue; }
      if (used.has(f.id)) continue;
      used.add(f.id);
      out += esc(s.slice(last, start)) + '<a class="term-link" href="' + href(f.id) + '" target="_blank" rel="noopener" title="' + esc("Glossary: " + f.term) + '">' +
        esc(m[0]) + '<span class="visually-hidden"> (glossary, opens in a new tab)</span></a>';
      last = end;
    }
    return out + esc(s.slice(last));
  }
  // A task's description and hints as HTML, each term linked at its first mention on the task (the description first,
  // then the hints in order). In the description only the first line and the numbered step lines ("2. Work out the
  // total.") are linked (prompt 31). Example lines and other lines are usually what the program prints, so they never
  // are; nor is text in a `code span`, which shows as code (codeHtml). A numbered line that is a line of the task's
  // own output ("1. Open the file" printed by the program) is output, not a step. -> { description, hints: [] }
  const STEP = /^\s*\d+\.\s/;
  function linkTask(task, compiled) {
    const used = new Set();
    const units = task.units && task.units.length ? task.units : task.unit ? [task.unit] : null;
    const outputLines = new Set((task.tests || []).flatMap((t) => String(t.expected || "").split("\n").map((l) => l.trim())));
    const lines = String(task.description || "").split("\n");
    const description = lines.map((line, i) => {
      const linkable = i === 0 || (STEP.test(line) && !outputLines.has(line.trim()));
      return codeHtml(line, linkable ? (s) => linkText(s, compiled, used, units) : esc);
    }).join("\n");
    return { description, hints: (task.hints || []).map((h) => linkText(h, compiled, used, units)) };
  }
  // A line of description text as HTML: each `code span` as <code> (its text escaped, every space kept), the rest
  // through plain(s) (escaped, and maybe linked). A lone ` with no partner stays as it is.
  function codeHtml(text, plain) {
    return String(text).split(/(`[^`\n]*`)/).map((part, i) => (i % 2 ? "<code>" + esc(part.slice(1, -1)) + "</code>" : (plain || esc)(part))).join("");
  }

  // ---------- The page (glossary.html) ----------
  const codeIn = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  function entryHtml(t) {
    return '<article class="gloss-entry" id="term-' + esc(t.id) + '"><h3 class="gloss-term">' + esc(t.term) + ' <span class="gloss-group">' + esc(t.group) + "</span></h3>" +
      '<p class="gloss-def">' + codeIn(t.definition) + "</p>" + '<pre class="gloss-example"><code>' + esc(t.example) + "</code></pre></article>";
  }
  // The list for what is typed: letters as headings, "No matching terms" when nothing matches.
  function listHtml(terms, query) {
    const found = search(terms, query);
    if (!found.length) return { count: 0, html: '<p class="gloss-none">' + NO_MATCH + ".</p>" };
    return { count: found.length, html: byLetter(found).map((g) => '<section class="gloss-letter" aria-labelledby="letter-' + (g.letter === "#" ? "num" : g.letter) + '">' +
      '<h2 class="gloss-letter-h" id="letter-' + (g.letter === "#" ? "num" : g.letter) + '">' + esc(g.letter === "#" ? "0–9" : g.letter) + "</h2>" + g.terms.map(entryHtml).join("") + "</section>").join("") };
  }
  function lettersHtml(terms) {
    return byLetter(terms).map((g) => '<a href="#letter-' + (g.letter === "#" ? "num" : g.letter) + '">' + esc(g.letter === "#" ? "0–9" : g.letter) + "</a>").join(" ");
  }

  function showPage(doc, win, data) {
    const terms = (data && data.terms) || [];
    const $ = (id) => doc.getElementById(id);
    const draw = () => {
      const r = listHtml(terms, $("gloss-search").value);
      $("gloss-list").innerHTML = r.html;
      $("gloss-status").textContent = !r.count ? NO_MATCH + "." : r.count === terms.length ? terms.length + " terms." : r.count + (r.count === 1 ? " term matches." : " terms match.");
      $("gloss-letters").hidden = r.count !== terms.length;
    };
    $("gloss-letters").innerHTML = lettersHtml(terms);
    $("gloss-search").addEventListener("input", draw);
    draw();
    // Opened from a link in a task: show that entry.
    const target = /^#term-[\w-]+$/.test(win.location.hash) ? $(win.location.hash.slice(1)) : null;
    if (target) { target.classList.add("gloss-target"); target.scrollIntoView({ block: "start" }); target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  }

  if (typeof document !== "undefined" && typeof self !== "undefined" && self.document === document && document.getElementById("gloss-list")) {
    if (self.Store && self.Store.setupDisplaySettings) self.Store.setupDisplaySettings(); // the theme and text size, as on every page
    // Back to the page it was opened from on this site (the teacher view, for a teacher), so the page names no other
    // page itself; opened any other way, back to the student's units.
    const back = document.getElementById("gloss-back");
    let from = null;
    try { const r = new URL(document.referrer); if (r.origin === location.origin && !/glossary\.html$/.test(r.pathname)) from = r.href; } catch (e) { from = null; }
    if (back && from) { back.href = from; back.textContent = "← Back"; }
    fetch("glossary.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => showPage(document, self, data))
      .catch(() => { document.getElementById("gloss-status").textContent = "Couldn't load the glossary. Open this site through a web server (see README.md)."; });
  }

  return { PAGE, NO_MATCH, href, letterOf, sorted, byLetter, search, compile, inUnits, linkText, linkTask, codeHtml, listHtml, entryHtml };
});
