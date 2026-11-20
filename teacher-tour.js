"use strict";

// The teacher tour (prompt 23): the same overlay as the student tour (tour.js Tour.run), with an overview step and one
// short step for each page of the teacher view. Each step points at that page's link in the side menu (on a phone,
// at the closed menu's button).
//   - It opens by itself the first time the teacher view is shown on this browser (after signing in, in backend mode),
//     and never again on this browser once it has been closed or finished. That is kept under KEY, with every storage
//     error caught: if storage is blocked it never opens by itself (it couldn't be remembered).
//   - Settings has a Replay tour button, which opens it from the start at any time.
//   - In local mode the steps for the pages that need the server (Homework, Assignments, Classes and Settings) say so.
// The rules (steps, storage) need no DOM, so tests/features.js checks them in Node.
(function (root, factory) {
  const TeacherTour = factory();
  if (typeof module === "object" && module.exports) module.exports = TeacherTour;
  else root.TeacherTour = TeacherTour;
})(typeof self !== "undefined" ? self : this, function () {
  const KEY = "pythonPractice.teacherTour";

  // Each step: two short sentences. local: the text in local mode, for a page that needs the server.
  const link = (page) => ['.side-nav a[data-page="' + page + '"]', "#nav-toggle", "#side-nav-links"];
  const STEPS = [
    { id: "overview", title: "The teacher view", targets: ["#side-nav"],
      text: "This menu opens each page of the teacher view. This short tour shows what each page is for." },
    { id: "students", title: "Students", targets: link("students"),
      text: "See each student's level and secured score in every unit. Select a name to open that student's page." },
    { id: "homework", title: "Homework", targets: link("homework"),
      text: "Set a number of tasks for the class to do by a due date. Each student sees it on their home page.",
      local: "Homework sets tasks for the class to do by a due date. This page needs the server, so it isn't in the menu here." },
    { id: "assignments", title: "Assignments", targets: link("assignments"),
      text: "Give the class a list of tasks to practise. It doesn't change their level or score.",
      local: "Assignments give the class a list of tasks to practise. This page needs the server, so it isn't in the menu here." },
    { id: "misconceptions", title: "Misconceptions", targets: link("misconceptions"),
      text: "See where the class goes wrong, task by task. Use it to plan small-group workshops." },
    { id: "leaderboards", title: "Leaderboards", targets: link("leaderboards"),
      text: "See who has the most points and who has improved most. You can compare your classes here too." },
    { id: "certificates", title: "Certificates", targets: link("certificates"),
      text: "A student earns a certificate for a block of units at 100%. Select Print to print one." },
    { id: "reports", title: "Reports", targets: link("reports"),
      text: "Download the class's data as CSV files. Each button shows what is in the file first." },
    { id: "tasks", title: "Task browser", targets: link("tasks"),
      text: "Find any task and try it as a student would. Your practice here is never recorded." },
    { id: "classes", title: "Classes", targets: link("classes"),
      text: "Create a class and share it with other teachers. Student logins and PIN resets are here too.",
      local: "Classes, student logins and sharing need the server. In this browser, every student is on the Students page." },
    { id: "curriculum", title: "Curriculum", targets: link("curriculum"),
      text: "See the OCR specification code for each unit. Print the table for planning or inspection." },
    { id: "settings", title: "Settings", targets: link("settings"),
      text: "Change your password here. Select Replay tour on this page to see this tour again.",
      local: "Teacher accounts and passwords need the server. To see this tour again, open teacher.html#settings and select Replay tour." },
  ];
  // The steps with their text for this mode.
  const stepsFor = (backend) => STEPS.map((s) => ({ id: s.id, title: s.title, targets: s.targets, text: !backend && s.local ? s.local : s.text }));

  // ---------- Seen on this browser ----------
  function getStorage(win) { try { return (win || self).localStorage || null; } catch (e) { return null; } }
  function storageWorks(storage) {
    if (!storage) return false;
    try { storage.setItem(KEY + ".check", "1"); storage.removeItem(KEY + ".check"); return true; } catch (e) { return false; }
  }
  function seen(storage) { try { return !!storage && storage.getItem(KEY) === "seen"; } catch (e) { return false; } }
  function remember(storage) { try { if (storage) storage.setItem(KEY, "seen"); return true; } catch (e) { return false; } }
  // Opens by itself only when it can be remembered and hasn't been seen.
  const shouldAutoStart = (storage) => storageWorks(storage) && !seen(storage);

  // ---------- Opening it ----------
  // o = { Tour (tour.js), doc, storage, backend, auto }. auto: the first-time check (nothing happens if it was seen).
  // Closing it in any way (Finish, Skip, Escape) marks it seen. -> the overlay, or null.
  function start(o) {
    if (o.auto && !shouldAutoStart(o.storage)) return null;
    return o.Tour.run({ doc: o.doc, steps: stepsFor(o.backend), elsewhere: "Open it from the menu.",
      onClose: (reason) => { if (reason !== "replaced") remember(o.storage); if (o.onClose) o.onClose(reason); } });
  }

  // ---------- Wiring (browser only) ----------
  let tried = false; // once per page load
  // teacher.js calls this each time a page is drawn: it opens once, when the teacher view is on show.
  function maybeStart(win, backend) {
    win = win || self;
    if (tried || !win.Tour) return null;
    const main = win.document.getElementById("teacher-main");
    if (!main || main.hidden) return null; // backend mode: not signed in yet
    tried = true;
    return start({ Tour: win.Tour, doc: win.document, storage: getStorage(win), backend, auto: true });
  }
  // Settings' Replay tour button.
  function replay(win, backend) {
    win = win || self;
    tried = true;
    return start({ Tour: win.Tour, doc: win.document, storage: getStorage(win), backend, auto: false });
  }

  return { KEY, STEPS, stepsFor, getStorage, storageWorks, seen, remember, shouldAutoStart, start, maybeStart, replay };
});
