"use strict";

// Class code cards (class-card.html, prompt 26): one A4 portrait card per class, opened from the teacher view's
// Classes page (Print card, or Print all classes). The classes come in the address's # part, which never goes to a
// server: classes = a JSON list of { n: class name, s: stage ("GCSE"), k: class code ("" if there is none) }, and
// print=1 opens the print window straight away. Every value is put on the page as text, never as HTML.
// The rules need no DOM, so tests/features.js checks them in Node; the page part runs only in a browser.
(function (root, factory) {
  const ClassCard = factory();
  if (typeof module === "object" && module.exports) module.exports = ClassCard;
  else root.ClassCard = ClassCard;
})(typeof self !== "undefined" ? self : this, function () {
  // The website's address on every card. The one place to change it before the pilot.
  const SITE_ADDRESS = "[SITE ADDRESS]";
  // What a student does, in four short steps, and the line at the bottom of the card.
  const STEPS = [
    "Go to " + SITE_ADDRESS + ".",
    "Choose 'New student'.",
    "Type the class code above and your nickname.",
    "Write down the code and PIN you are given. Keep them secret.",
  ];
  const FOOTER = "If you forget your PIN, ask your teacher.";
  const NO_CODE = "This browser has no class code. Class codes need the server.";
  const MAX_CARDS = 60;

  // The cards in an address's # part: [{ name, stage, code }] (at most MAX_CARDS; names, stages and codes cut short).
  function parse(hash) {
    let list = [];
    try { list = JSON.parse(new URLSearchParams(String(hash || "").replace(/^#/, "")).get("classes") || "[]"); } catch (e) { list = []; }
    if (!Array.isArray(list)) return [];
    const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    return list.slice(0, MAX_CARDS).map((c) => ({ name: text(c && c.n, 100), stage: text(c && c.s, 20), code: text(c && c.k, 12) })).filter((c) => c.name);
  }
  // The address of the page for these classes ([{ name, stage, code }]); print: open the print window at once.
  const url = (cards, print) => "class-card.html#" + new URLSearchParams(Object.assign({ classes: JSON.stringify(cards.map((c) => ({ n: c.name, s: c.stage, k: c.code || "" }))) }, print ? { print: "1" } : {})).toString();

  // One card as DOM nodes (text only), made with the page's document.
  function card(doc, c) {
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const sec = el("section", "cc-card");
    sec.setAttribute("aria-label", "Class code card for " + c.name);
    sec.appendChild(el("p", "cc-brand", "Pythons and Ladders"));
    sec.appendChild(el("h2", "cc-class", c.name));
    if (c.stage) sec.appendChild(el("p", "cc-stage", c.stage));
    sec.appendChild(el("p", "cc-label", "Class code"));
    sec.appendChild(c.code ? el("p", "cc-code", c.code) : el("p", "cc-code cc-no-code", NO_CODE));
    const site = el("p", "cc-site", "Website: ");
    site.appendChild(el("strong", null, SITE_ADDRESS));
    sec.appendChild(site);
    sec.appendChild(el("h3", "cc-how", "How to join"));
    const ol = el("ol", "cc-steps");
    for (const s of STEPS) ol.appendChild(el("li", null, s));
    sec.appendChild(ol);
    sec.appendChild(el("p", "cc-footer", FOOTER));
    return sec;
  }

  // The page: every card, or one line if there is nothing to show.
  function show(doc, hash) {
    const cards = parse(hash);
    const host = doc.getElementById("cards");
    if (!cards.length) { doc.getElementById("cards-missing").hidden = false; return cards; }
    for (const c of cards) host.appendChild(card(doc, c));
    host.hidden = false;
    doc.getElementById("cards-note").hidden = false;
    doc.title = (cards.length === 1 ? "Class code card: " + cards[0].name : cards.length + " class code cards") + " – Pythons and Ladders";
    return cards;
  }

  if (typeof document !== "undefined" && typeof self !== "undefined" && self.document === document && document.getElementById("cards")) {
    show(document, location.hash);
    if (new URLSearchParams(location.hash.slice(1)).get("print") === "1" && document.querySelector(".cc-card")) window.addEventListener("load", () => setTimeout(() => window.print(), 300));
  }

  return { SITE_ADDRESS, STEPS, FOOTER, NO_CODE, MAX_CARDS, parse, url, card, show };
});
