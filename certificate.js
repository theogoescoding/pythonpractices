"use strict";

// One certificate (certificate.html), from the address's # part, as the teacher view's Print button makes it:
//   s student name, c class name (none in local mode), b block name, d earned date (YYYY-MM-DD), t teacher's name,
//   print=1 to open the print window straight away.
// Every value is put on the page as text, never as HTML. No percentage or floor is shown.
(function () {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.hash.slice(1));
  const get = (k) => (q.get(k) || "").trim().slice(0, 200);
  const name = get("s"), block = get("b"), date = self.Certificates.longDate(get("d"));
  if (!name || !block || !date) { $("cert-missing").hidden = false; return; }
  $("cert-title").textContent = self.Certificates.TITLE;
  $("cert-name").textContent = name;
  const cls = get("c");
  $("cert-class").textContent = cls ? "of " + cls : "";
  $("cert-class").hidden = !cls;
  $("cert-block").textContent = block;
  $("cert-date").textContent = date;
  $("cert-teacher").textContent = get("t") || "your teacher";
  document.title = block + " certificate for " + name + " – " + self.Certificates.TITLE;
  $("certificate").hidden = false;
  $("cert-note").hidden = false;
  if (q.get("print") === "1") window.addEventListener("load", () => setTimeout(() => window.print(), 300));
})();
