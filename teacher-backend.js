// Backend mode for the teacher view (config.js BACKEND_ENABLED = true): sign-in, classes, students, codes and PINs.
// Teachers read their classes directly through Supabase (row-level security lets them see only their own), and use
// the teacher-api Edge Function for codes, PINs, placement resets and import. The class's data is turned into the same
// data object teacher-data.js uses in local mode (BackendRows.teacherData), so every page and export is unchanged.
// In local mode this file does nothing.

(function () {
  const config = self.APP_CONFIG || {};
  const enabled = !!(config.BACKEND_ENABLED && config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
  if (!enabled) { self.TeacherBackend = { enabled: false }; return; }

  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js";
  const SUPABASE_JS_SRI = "sha384-2zrRDgDHSYB/GN3nFW3fsZXoxEhKIr3N2h63Tc6DEOB9JJdFIu8xMJT2Cph/gBil";
  const CLASS_KEY = "pyPractice.teacherClass.v1"; // the class last chosen (this browser only)
  const ENDING_SOON_DAYS = 30;
  const PAGE = 1000; // rows per request (the API's limit)
  const ATTEMPT_COLUMNS = "id, student_id, record_id, record_type, timestamp, unit, task_units, task_id, template_id, phase, task_type, " +
    "task_level, student_level_before, student_level_after, attempt_number, result, failure_category, failure_details, " +
    "misconception_matches, hints_used, hint_type, variant_fingerprint, failed_test_number, failed_test_inputs, " +
    "expected_output, student_output, student_error_type, student_error_kind, student_code";
  const EVENT_COLUMNS = "id, student_id, record_id, record_type, timestamp, unit, task_id, student_level_before, student_level_after, " +
    "level_change_reason, button, placement_start_level, placement_results";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const day = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

  let sb = null;
  let user = null;
  let classes = [];
  let current = null;   // the chosen class row
  let students = [];    // its students
  let codes = null;     // { student_id: code } after "Show codes"
  let onData = () => {};

  function loadSupabase() {
    return new Promise((resolve, reject) => {
      if (self.supabase) return resolve(self.supabase);
      const s = document.createElement("script");
      s.src = SUPABASE_JS;
      s.integrity = SUPABASE_JS_SRI;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve(self.supabase);
      s.onerror = () => reject(new Error("Couldn't load the sign-in code. Check your internet connection."));
      document.head.appendChild(s);
    });
  }

  function say(id, text, problem) {
    const el = $(id);
    el.textContent = text || "";
    el.hidden = !text;
    el.className = problem ? "problem" : text ? "notice notice-up" : "";
  }

  // Every row a query returns, a page at a time.
  async function all(query) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await query().range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  }

  async function teacherApi(action, body) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    try {
      const res = await fetch(config.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/teacher-api", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.SUPABASE_ANON_KEY, Authorization: "Bearer " + token },
        body: JSON.stringify(Object.assign({ action }, body)),
      });
      let json = {};
      try { json = await res.json(); } catch (e) { /* empty */ }
      return { status: res.status, body: json };
    } catch (e) {
      return { status: 0, body: { error: "Couldn't reach the server. Check your internet connection." } };
    }
  }

  // ---------- Signing in ----------
  function showAuth() {
    const signup = location.hash === "#signup";
    $("tb-auth").hidden = false;
    $("tb-classes").hidden = true;
    $("teacher-main").hidden = true;
    $("tb-signin-form").hidden = signup;
    $("tb-signup-form").hidden = !signup;
    $("tb-auth-h").textContent = signup ? "Create a teacher account" : "Teacher sign-in";
    (signup ? $("tb-new-name") : $("tb-email")).focus();
  }

  function wireAuth() {
    $("tb-to-signup").addEventListener("click", (e) => { e.preventDefault(); location.hash = "signup"; showAuth(); });
    $("tb-to-signin").addEventListener("click", (e) => { e.preventDefault(); location.hash = "signin"; showAuth(); });

    $("tb-signin-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: $("tb-email").value.trim(), password: $("tb-password").value });
      $("tb-password").value = "";
      if (error) return say("tb-auth-status", /confirm/i.test(error.message)
        ? "Please confirm your email first: open the link in the email we sent you." : "That email or password isn't right.", true);
      say("tb-auth-status", "");
      await afterSignIn();
    });

    $("tb-signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("tb-new-name").value.trim();
      const email = $("tb-new-email").value.trim();
      const password = $("tb-new-password").value;
      if (!name || !email || password.length < 10) return say("tb-auth-status", "Please give your name, your email and a password of at least 10 characters.", true);
      const { data, error } = await sb.auth.signUp({ email, password,
        options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
      $("tb-new-password").value = "";
      if (error) return say("tb-auth-status", error.message, true);
      if (data.session) return afterSignIn(); // email confirmation turned off
      say("tb-auth-status", "Nearly done: we've sent a link to " + email + ". Open it to confirm your email, then sign in here and create your first class.");
    });

    $("tb-signout").addEventListener("click", async () => {
      await sb.auth.signOut();
      user = null; current = null; students = []; codes = null;
      location.hash = "signin";
      showAuth();
    });
  }

  // Shows the sign-in panel with the server's reason, so a failure is never silent.
  function showAuthProblem(what, error) {
    $("tb-auth").hidden = false;
    $("tb-classes").hidden = true;
    say("tb-auth-status", what + " (" + (error.message || error.code || "unknown error") + "). Please try again.", true);
  }

  // The teachers row is made the first time a confirmed teacher signs in.
  async function afterSignIn() {
    const { data } = await sb.auth.getUser();
    user = data.user;
    if (!user) return showAuth();
    const mine = await sb.from("teachers").select("id, name").eq("id", user.id).maybeSingle();
    if (mine.error) return showAuthProblem("Couldn't load your account", mine.error);
    if (!mine.data) {
      const made = await sb.from("teachers").insert({ id: user.id, name: (user.user_metadata && user.user_metadata.name) || user.email });
      if (made.error) return showAuthProblem("Couldn't finish setting up your account", made.error);
    }
    $("tb-auth").hidden = true;
    $("tb-classes").hidden = false;
    $("tb-who").textContent = (mine.data && mine.data.name) || user.email;
    if (["#signin", "#signup"].includes(location.hash)) history.replaceState(null, "", location.pathname + "#overview");
    await loadClasses(store.get(CLASS_KEY));
  }

  // ---------- Classes ----------
  async function loadClasses(chooseId) {
    const r = await sb.from("classes").select("id, name, class_code, end_of_year, created_at").order("name");
    if (r.error) return say("tb-status", "Couldn't load your classes. Please try again.", true);
    classes = r.data;
    $("tb-class").innerHTML = classes.map((c) => '<option value="' + c.id + '">' + esc(c.name) + "</option>").join("");
    const soon = classes.filter((c) => (new Date(c.end_of_year + "T00:00:00") - Date.now()) / 86400000 <= ENDING_SOON_DAYS);
    $("tb-ending").hidden = !soon.length;
    $("tb-ending").innerHTML = "<strong>Ending within " + ENDING_SOON_DAYS + " days:</strong> " +
      soon.map((c) => esc(c.name) + " (" + esc(day(c.end_of_year)) + ")").join(", ") +
      ". On its end date a class is deleted with all its students' data. Export it first if you need to keep it.";
    $("tb-class").disabled = !classes.length;
    if (!classes.length) {
      current = null;
      $("tb-class-info").hidden = true;
      $("teacher-main").hidden = true;
      say("tb-status", "You don't have a class yet. Type a name above and create your first class.");
      $("tb-new-class-name").focus();
      return;
    }
    const pick = classes.find((c) => c.id === chooseId) || classes[0];
    $("tb-class").value = pick.id;
    await chooseClass(pick.id);
  }

  async function chooseClass(id) {
    current = classes.find((c) => c.id === id) || null;
    codes = null;
    $("tb-copy-codes").hidden = true;
    $("tb-pin-result").innerHTML = "";
    if (!current) return;
    store.set(CLASS_KEY, id);
    $("tb-class-info").hidden = false;
    $("teacher-main").hidden = false;
    $("tb-code").textContent = current.class_code;
    $("tb-end").textContent = day(current.end_of_year);
    say("tb-status", "");
    renderImportArea();
    await loadClassData();
  }

  // Reads the class's students and all their data, and hands the teacher view the same data object as local mode.
  async function loadClassData() {
    if (!current) return;
    try {
      const inClass = (table, columns) => () => sb.from(table).select(columns + ", students!inner(class_id)")
        .eq("students.class_id", current.id).order("id");
      const [st, progress, attempts, events] = await Promise.all([
        all(() => sb.from("students").select("id, nickname, created_at, imported, locked_until").eq("class_id", current.id).order("created_at").order("id")),
        all(() => sb.from("progress").select("student_id, unit, state, students!inner(class_id)").eq("students.class_id", current.id).order("student_id").order("unit")),
        all(inClass("attempts", ATTEMPT_COLUMNS)),
        all(inClass("events", EVENT_COLUMNS)),
      ]);
      students = st;
      renderStudents();
      onData(BackendRows.teacherData({ students: st, progress, attempts, events }, self.Curriculum.UNITS));
    } catch (e) {
      say("tb-status", "Couldn't load this class's data. Please try again.", true);
    }
  }

  function renderStudents() {
    $("tb-students").innerHTML = students.length ? students.map((s) => {
      const locked = s.locked_until && Date.parse(s.locked_until) > Date.now();
      return '<tr><th scope="row">' + esc(s.nickname) + "</th><td>" +
        (codes ? '<span class="class-code">' + esc((codes[s.id] || "").replace(/(\d{4})(\d{4})/, "$1 $2")) + "</span>" : '<span class="small">hidden</span>') +
        "</td><td>" + (s.imported ? "Imported from an export" : "Joined with the class code") + "</td><td>" + (locked ? '<span class="flag flag-alert">Locked (too many wrong PINs)</span>' : "Set") +
        '</td><td><button type="button" class="secondary" data-pin="' + s.id + '">Reset PIN</button> ' +
        '<button type="button" class="secondary" data-delete="' + s.id + '">Delete</button>' +
        '<span data-confirm="' + s.id + '" hidden> Delete ' + esc(s.nickname) + " and all their data? " +
        '<button type="button" class="danger" data-delete-yes="' + s.id + '">Yes, delete</button> ' +
        '<button type="button" class="secondary" data-delete-no="' + s.id + '">Cancel</button></span></td></tr>';
    }).join("") : '<tr><td colspan="5">No students yet. They join with the class code ' + esc(current.class_code) + ".</td></tr>";
  }

  function wireClasses() {
    $("tb-class").addEventListener("change", () => chooseClass($("tb-class").value));
    $("tb-reload").addEventListener("click", loadClassData);

    $("tb-new-class").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("tb-new-class-name").value.trim();
      if (!name) return say("tb-status", "Please type a name for the class.", true);
      const r = await sb.from("classes").insert({ name }).select("id, class_code").single();
      if (r.error) return say("tb-status", "Couldn't create the class. Please try again.", true);
      $("tb-new-class-name").value = "";
      await loadClasses(r.data.id);
      say("tb-status", "Class " + name + " created. Its class code is " + r.data.class_code + ": give it to your students so they can join.");
    });

    $("tb-show-codes").addEventListener("click", async () => {
      const r = await teacherApi("reveal_codes", { class_id: current.id });
      if (r.status !== 200) return say("tb-status", r.body.error || "Couldn't show the codes.", true);
      codes = Object.fromEntries(r.body.codes.map((c) => [c.student_id, c.code]));
      $("tb-copy-codes").hidden = !r.body.codes.length;
      $("tb-copy-codes").onclick = () => copy(r.body.codes.map((c) => c.nickname + "\t" + c.code).join("\n"), "tb-status");
      renderStudents();
    });

    $("tb-students").addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const s = (id) => students.find((x) => x.id === id);
      const confirmEl = (id) => $("tb-students").querySelector('[data-confirm="' + id + '"]');
      if (b.dataset.pin) {
        const r = await teacherApi("reset_pin", { student_id: b.dataset.pin });
        if (r.status !== 200) return say("tb-status", r.body.error || "Couldn't reset the PIN.", true);
        $("tb-pin-result").innerHTML = '<p class="notice notice-up">New PIN for <strong>' + esc(s(b.dataset.pin).nickname) + "</strong>: " +
          '<strong class="class-code">' + esc(r.body.pin) + "</strong>. Give it to them now: it won't be shown again. Any lock is cleared.</p>";
        await loadClassData();
      } else if (b.dataset.delete) {
        confirmEl(b.dataset.delete).hidden = false;
      } else if (b.dataset.deleteNo) {
        confirmEl(b.dataset.deleteNo).hidden = true;
      } else if (b.dataset.deleteYes) {
        const name = s(b.dataset.deleteYes).nickname;
        const r = await sb.from("students").delete().eq("id", b.dataset.deleteYes);
        if (r.error) return say("tb-status", "Couldn't delete the student.", true);
        say("tb-status", name + " and all their data have been deleted.");
        await loadClassData();
      }
    });

    $("tb-delete-class").addEventListener("click", () => { $("tb-delete-confirm").hidden = false; $("tb-delete-name").focus(); });
    $("tb-delete-no").addEventListener("click", () => { $("tb-delete-confirm").hidden = true; $("tb-delete-name").value = ""; });
    $("tb-delete-yes").addEventListener("click", async () => {
      if ($("tb-delete-name").value.trim() !== current.name) return say("tb-status", "Type the class name exactly as it is shown to delete it.", true);
      const name = current.name;
      const r = await sb.from("classes").delete().eq("id", current.id);
      if (r.error) return say("tb-status", "Couldn't delete the class.", true);
      $("tb-delete-confirm").hidden = true;
      $("tb-delete-name").value = "";
      await loadClasses();
      say("tb-status", "The class " + name + ", its students and all their data have been deleted.");
    });
  }

  // ---------- Import a full export (section 8) ----------
  const IMPORT_STUDENTS_PER_CALL = 10;
  const IMPORT_ROWS_PER_CALL = { progress: 200, passed: 500, attempts: 150, events: 500 }; // keeps each call under 1 MB
  let imp = null; // { planned, names: [{ file_id, inFile, nickname, status, message }], checkedOk }

  function renderImportArea() {
    $("tb-import").innerHTML =
      '<h3 style="margin-top:1.5rem">Import full export</h3>' +
      '<p class="small">Adds a full-data export (python-practice-full-data-….csv, made with "Export full data" before the class used the server) to this class. ' +
      "Each student in the file who isn't in the class yet gets a login code and PIN. Importing the same file twice adds nothing new.</p>" +
      '<p><label>Choose the CSV file <input type="file" id="imp-file" accept=".csv,text/csv"></label></p>' +
      '<p id="imp-status" role="status"></p><div id="imp-names"></div><div id="imp-result"></div>';
    $("imp-file").addEventListener("change", readImportFile);
    imp = null;
  }

  async function readImportFile() {
    const file = $("imp-file").files[0];
    $("imp-result").innerHTML = "";
    if (!file) return;
    const rows = BackendImport.parseCsv(await file.text());
    if (!rows) { imp = null; $("imp-names").innerHTML = ""; return say("imp-status", "That file isn't a full-data export. Use the file made by \"Export full data\".", true); }
    const tasks = await fetch("tasks.json").then((r) => r.json()).catch(() => []);
    const planned = BackendImport.plan(rows, tasks);
    imp = { planned, checkedOk: false, names: planned.students.map((s) => ({ file_id: s.file_id, inFile: s.nickname, nickname: s.nickname })) };
    say("imp-status", rows.length + " rows for " + planned.students.length + " students. Checking the nicknames…");
    await checkImportNames();
  }

  // Asks the server about every nickname (saves nothing) and shows which need renaming.
  async function checkImportNames() {
    const r = await teacherApi("import_check", { class_id: current.id, students: imp.names.map((n) => ({ file_id: n.file_id, nickname: n.nickname })) });
    if (r.status !== 200) return say("imp-status", r.body.error || "Couldn't check the nicknames.", true);
    r.body.students.forEach((s, i) => Object.assign(imp.names[i], { nickname: s.nickname, status: s.status, message: s.message }));
    imp.checkedOk = r.body.ok;
    const flagged = imp.names.filter((n) => !["new", "existing"].includes(n.status)).length;
    say("imp-status", flagged ? flagged + " nickname" + (flagged === 1 ? " needs" : "s need") + " changing before anything can be imported. Nothing has been saved."
      : "All nicknames are fine. Check the list, then import.", !!flagged);
    $("imp-names").innerHTML = '<div class="table-wrap"><table><thead><tr><th scope="col">Name in the file</th><th scope="col">Nickname in this class</th><th scope="col">Status</th></tr></thead><tbody>' +
      imp.names.map((n, i) => {
        const bad = !["new", "existing"].includes(n.status);
        return "<tr" + (bad ? ' class="row-alert"' : "") + "><td>" + esc(n.inFile) + '</td><td><input type="text" class="text-input" data-imp-name="' + i + '" value="' + esc(n.nickname) +
          '" maxlength="40" aria-label="Nickname for ' + esc(n.inFile) + '"' + (bad ? ' aria-invalid="true"' : "") + "></td><td>" + esc(n.message) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="teacher-controls"><button type="button" id="imp-recheck" class="secondary">Check the nicknames again</button>' +
      '<button type="button" id="imp-go" class="primary"' + (imp.checkedOk ? "" : " disabled") + ">Import " + imp.planned.students.length + " students</button></p>";
    $("imp-names").querySelectorAll("input[data-imp-name]").forEach((el) => el.addEventListener("input", () => {
      imp.names[+el.dataset.impName].nickname = el.value; // only trimmed when checked; nothing is changed for the teacher
      imp.checkedOk = false;
      $("imp-go").disabled = true;
    }));
    $("imp-recheck").addEventListener("click", checkImportNames);
    $("imp-go").addEventListener("click", runImport);
  }

  const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };

  async function runImport() {
    if (!imp || !imp.checkedOk) return;
    $("imp-go").disabled = true;
    $("imp-recheck").disabled = true;
    const names = imp.names.map((n) => ({ file_id: n.file_id, nickname: n.nickname }));
    const made = [];
    const idOf = {};
    try {
      for (const part of chunks(names, IMPORT_STUDENTS_PER_CALL)) {
        say("imp-status", "Adding students… (" + made.length + " of " + names.length + ")");
        const r = await teacherApi("import_students", { class_id: current.id, students: part, all_nicknames: names.map((n) => n.nickname) });
        if (r.status !== 200) throw new Error(r.body.error || "Couldn't add the students.");
        for (const s of r.body.students) { idOf[s.file_id] = s.student_id; made.push(s); }
      }
      const built = BackendImport.rebuild(imp.planned, self.freshUnitState);
      const withId = (list) => list.filter((r) => idOf[r.file_id]).map(({ file_id, ...rest }) => Object.assign(rest, { student_id: idOf[file_id] }));
      const total = { progress: [0, 0], passed: [0, 0], attempts: [0, 0, []], events: [0, 0, []] };
      const send = { progress: withId(built.progress), passed: withId(built.passed), attempts: withId(imp.planned.attempts), events: withId(imp.planned.events) };
      for (const kind of ["progress", "passed", "attempts", "events"]) {
        for (const part of chunks(send[kind], IMPORT_ROWS_PER_CALL[kind])) {
          say("imp-status", "Importing " + kind + "…");
          const r = await teacherApi("import_data", { class_id: current.id, [kind]: part });
          if (r.status !== 200) throw new Error(r.body.error || "Couldn't import the " + kind + ".");
          const c = r.body[kind];
          total[kind][0] += c.saved; total[kind][1] += c.skipped;
          if (c.rejected) total[kind][2].push(...c.rejected);
        }
      }
      showImportResult(made, total, built.report);
    } catch (e) {
      say("imp-status", e.message + " You can import the same file again: anything already imported is skipped.", true);
      $("imp-recheck").disabled = false;
    }
    $("imp-file").value = ""; // so choosing the same file again starts a new import
    await loadClassData();
  }

  function showImportResult(made, total, report) {
    const fresh = made.filter((s) => s.new);
    const li = (items) => "<ul>" + items.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>";
    const counts = (k, label) => label + ": " + total[k][0] + " added" + (total[k][1] ? ", " + total[k][1] + " already there" : "") +
      (total[k][2] && total[k][2].length ? ", " + total[k][2].length + " not accepted" : "");
    say("imp-status", "Import finished.");
    $("imp-names").innerHTML = "";
    $("imp-result").innerHTML =
      (fresh.length ? "<h4>New students: give each one their code and PIN</h4>" +
        '<p class="small">This is the only time these PINs are shown. Codes can be shown again with "Show codes"; PINs can only be reset.</p>' +
        '<div class="table-wrap"><table><thead><tr><th scope="col">Nickname</th><th scope="col">Code</th><th scope="col">PIN</th></tr></thead><tbody>' +
        fresh.map((s) => "<tr><td>" + esc(s.nickname) + '</td><td class="class-code">' + esc(s.code.replace(/(\d{4})(\d{4})/, "$1 $2")) + '</td><td class="class-code">' + esc(s.pin) + "</td></tr>").join("") +
        '</tbody></table></div><p><button type="button" id="imp-copy" class="secondary">Copy codes and PINs</button></p>' : "") +
      (made.length > fresh.length ? "<p>" + (made.length - fresh.length) + " students were already in the class; their rows were added to them.</p>" : "") +
      "<h4>What was imported</h4>" + li([counts("attempts", "Attempts, skips and hints"), counts("events", "Level changes, button uses and placement records"),
        counts("progress", "Units of progress") + " (a unit a student already has is never overwritten)", counts("passed", "Passed tasks")]) +
      "<h4>Rebuilt from the file</h4>" + li(BackendImport.REBUILT) +
      "<h4>Not rebuilt (an export doesn't have them)</h4>" + li(BackendImport.NOT_REBUILT.concat(
        report.passedWithoutFingerprint ? [report.passedWithoutFingerprint + " passed template variants from an older export have no fingerprint, so a similar variant may be set again"] : [],
        report.noLevel ? [report.noLevel + " units had no level in the file and were left for the student to start"] : []));
    if (fresh.length) $("imp-copy").addEventListener("click", () => copy(fresh.map((s) => s.nickname + "\t" + s.code + "\t" + s.pin).join("\n"), "imp-status"));
  }

  async function copy(text, statusId) {
    try { await navigator.clipboard.writeText(text); say(statusId, "Copied."); }
    catch (e) { say(statusId, "Couldn't copy. Select the table and copy it instead.", true); }
  }

  // ---------- For teacher.js ----------
  self.TeacherBackend = {
    enabled: true,
    // Shows sign-in or the teacher's classes; calls handler(data) each time a class's data is loaded.
    async start(handler) {
      onData = handler;
      $("local-notice").hidden = true;
      $("teacher-main").hidden = true;
      try { sb = (await loadSupabase()).createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY); }
      catch (e) { $("tb-auth").hidden = false; return say("tb-auth-status", e.message, true); }
      wireAuth();
      wireClasses();
      const { data } = await sb.auth.getSession();
      if (data.session) await afterSignIn(); else showAuth();
    },
    reload: loadClassData,
    async resetPlacement(studentId, unit) {
      const r = await teacherApi("reset_placement", { student_id: studentId, unit });
      if (r.status === 200 && r.body.reset) await loadClassData();
      return r;
    },
    api: teacherApi,
    currentClass: () => current,
    copy,
  };
})();
