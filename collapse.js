"use strict";

// Collapsible sections, shared by the student view (the unit groups, home.js) and the teacher view (teacher.js).
// Each section has a heading whose whole text is a button (aria-expanded, aria-controls) and a body that is hidden
// when it is collapsed. Every section starts expanded (unless it is marked closed by default). The ids of the collapsed ones are remembered on this device
// under the key each page passes in. Storage can be blocked: then nothing is remembered and every section simply
// starts expanded again next time.
(function () {
  function collapsedIds(key) {
    try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveCollapsed(key, ids) {
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch (e) { /* blocked: not remembered */ }
  }

  // The heading button. titleHtml and extraHtml must already be escaped. The body's id is bodyId. closedByDefault:
  // the section starts collapsed, and the ones opened are remembered instead (as "open:<id>" in the same list).
  function buttonHtml(id, bodyId, titleHtml, open, extraHtml, closedByDefault) {
    return '<button type="button" class="group-toggle" data-group="' + id + '" aria-expanded="' + open + '" aria-controls="' + bodyId + '"' +
      (closedByDefault ? ' data-closed-by-default="true"' : "") + '>' +
      '<span class="group-arrow" aria-hidden="true"></span>' + titleHtml + (extraHtml || "") + "</button>";
  }

  // Opens and closes a section when its heading button inside root is pressed, and remembers it under key.
  function wire(root, key) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button.group-toggle");
      if (!b || !root.contains(b)) return;
      const open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open));
      const body = document.getElementById(b.getAttribute("aria-controls"));
      if (body) body.hidden = !open;
      if (b.dataset.closedByDefault === "true") {
        const ids = collapsedIds(key).filter((id) => id !== "open:" + b.dataset.group);
        saveCollapsed(key, open ? ids.concat(["open:" + b.dataset.group]) : ids);
        return;
      }
      const ids = collapsedIds(key).filter((id) => id !== b.dataset.group);
      saveCollapsed(key, open ? ids : ids.concat([b.dataset.group]));
    });
  }

  // Turns every <section data-collapse="id"> inside root into a collapsible section: its first child must be its
  // heading, and everything after the heading becomes the body. Used for sections written in the page's HTML.
  // A section with data-collapse-default="closed" starts collapsed until it has been opened on this device.
  function enhance(root, key) {
    const collapsed = collapsedIds(key);
    root.querySelectorAll("section[data-collapse]").forEach((s) => {
      const id = s.dataset.collapse;
      const h = s.firstElementChild;
      const closedByDefault = s.dataset.collapseDefault === "closed";
      const open = closedByDefault ? collapsed.includes("open:" + id) : !collapsed.includes(id);
      const body = document.createElement("div");
      body.className = "group-body";
      body.id = "section-" + id;
      body.hidden = !open;
      while (h.nextSibling) body.appendChild(h.nextSibling);
      s.appendChild(body);
      h.classList.add("group-heading");
      h.innerHTML = buttonHtml(id, body.id, h.innerHTML, open, "", closedByDefault);
    });
    wire(root, key);
  }

  // The student view's unit groups follow the class's stage: the first time a stage is seen on this device, or when it
  // changes, the collapsed sections become that stage's (collapsed = the ids to close). After that the student's own
  // opening and closing is kept. The stage it was set for is remembered next to the key.
  function resetForStage(key, stage, collapsed) {
    let seen = null;
    try { seen = localStorage.getItem(key + ".stage"); } catch (e) { return false; }
    if (seen === stage) return false;
    saveCollapsed(key, collapsed);
    try { localStorage.setItem(key + ".stage", stage); } catch (e) { /* blocked: not remembered */ }
    return true;
  }

  self.Collapse = { collapsedIds, saveCollapsed, buttonHtml, wire, enhance, resetForStage };
})();
