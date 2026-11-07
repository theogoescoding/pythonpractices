# Python Practice (prototype)

A browser-based Python practice app for students aged 11–16, aligned to KS3 and OCR GCSE Computer Science J277 (section 2.2, programming fundamentals). It has ten units, in this order:

| Unit | Covers | Practice tasks | Placement tasks |
|---|---|---|---|
| Output and sequence | `print`, comments, running a script, order of statements | 51 | 8 |
| Variables and input | assignment, `input()`, casting with `int()` and `str()` | 51 | 8 |
| Data types and casting | integer, real (`float`), Boolean and string; choosing a type; casting with `int()`, `float()`, `str()` and `bool()` | 32 | 8 |
| Maths in Python | `+ - * /`, `//`, `%`, `**`, operator precedence, rounding | 50 | 8 |
| Selection | `if`, `if/else`, `elif`, comparison operators, `and`/`or` | 189 | 8 |
| Condition-controlled loops | `while`: counters, running totals, sentinel values, input validation, menus, endless loops | 40 | 8 |
| Count-controlled loops | `for` and `range()`: steps, the loop variable, counting, nested loops, looping over a string | 40 | 8 |
| Strings | `len()`, indexing, slicing, `upper()`/`lower()`, `find()`, `replace()` and `in` | 32 | 8 |
| Random | `import random`, `random.randint()` and `random.choice()`, dice and coin simulations | 32 | 8 |
| Lists | making a list, indexing, `append()`, `len()`, looping over a list | 32 | 8 |

On top of the task bank, `templates.json` holds 682 task templates with randomised values: one made from every practice task (549), plus 60 single-unit, 43 combined and 30 "Write from scratch" templates. A student never gets a task they have already passed: once the bank tasks at their level run out, they get new variants made from the templates.

- **Each unit has its own level (1–10) for each student.** Levels are about support, not topic: every unit runs from predicting the output (level 1) up to writing an extended program (level 10).
- **A placement test** finds each student's starting level the first time they open a unit.
- **Every failed attempt is classified automatically** (syntax error, wrong output, …) and matched against known **misconceptions**, so the teacher view can show who needs which workshop. The student sees the misconception's explanation and one thing to try next.
- **"Show me how"** offers a worked example after 2 failed attempts on the same task.
- **Every task shows its expected output** in a box, from one example test. The other tests are hidden.
- **Class assignments** (backend mode): a teacher sets tasks for a class, as practice only. See [Class assignments](#class-assignments-backend-mode).
- **A Task browser** in the teacher view shows any task's question, expected output, tests and model solution.
- **Student code runs in the browser.** It uses [Pyodide](https://pyodide.org) inside a Web Worker. A run is stopped after 5 seconds, so infinite loops can't freeze the page.
- **Two storage modes.** In **local mode** (the default) nothing leaves the browser: there is no backend or analytics, and names, progress and attempts are stored in `localStorage`. In **backend mode** (see [Backend mode](#backend-mode-supabase)) students join a class and their work is saved to a Supabase database, so they can carry on from any computer and the teacher sees the whole class. There are no analytics in either mode.

## Running it locally

The app must be served over HTTP. Opening `index.html` by double-clicking it won't work, because browsers block `fetch()` and Web Workers on `file://` pages.

From this folder:

```
python -m http.server 8000
```

Then open:

- Student app: http://localhost:8000/
- Test mode (starting-level control): http://localhost:8000/?test=1
- Teacher view: http://localhost:8000/teacher.html (pages: `#overview`, `#log`, `#workshop`, `#assignments`, `#tasks`)
- A student's progress summary: http://localhost:8000/progress.html
- Endless mode: http://localhost:8000/endless.html

Any static web server works. The first visit downloads Pyodide (about 10 MB) and the CodeMirror editor (about 190 KB) from `cdn.jsdelivr.net`. After that, the browser loads them from its cache.

## Backend mode (Supabase)

The pages stay static files (GitHub Pages). With `config.js` setting `BACKEND_ENABLED: true`, they use a Supabase project instead of keeping everything in one browser:

- **Teachers** sign up with an email and password (the email must be confirmed), create classes, and see only their own classes. Each class has a 6-character class code and an end date (31 August at the end of the school year). On that date the class and all its data are deleted.
- **Students** are not Supabase users. A new student joins with the class code and a nickname (2–20 letters or numbers, checked against `backend/nickname-filter.json`) and is shown an **8-digit code and a 4-digit PIN** once. A returning student signs in with them on any computer. Five wrong PINs in a row lock the account for 15 minutes.
  - PINs are stored as PBKDF2-SHA256 hashes (50,000 iterations, built into the function runtime). They used to be bcrypt (bcryptjs), but that was pure JavaScript and about 6 times slower: a class of 30 signing in at once on the test project made some requests hit the function's limit (status 546). A PIN hashed the old way still works and is re-hashed at the student's next correct sign-in. A 4-digit PIN has only 10,000 values, so the real protection is that the hash is never readable and the 5-try lock.
  - If the server answers a sign-in with a 5xx (for example 546 when it is briefly overloaded), the app tries again up to twice, after a short random pause. Joining a class is never retried, because a join that failed after the student was made would come back as a taken nickname.
- **Saving:** `Store` (store.js) keeps its synchronous API. Its localStorage keys become a cache of the signed-in student's data, filled when a page opens. Every write also goes into an outbox, which `backend.js` sends 1.5 seconds after it changes and then retries until it arrives. Work done offline is kept and sent later. On a shared computer, the next student signing in removes the last student's cached data, but anything they hadn't sent yet is still sent, with their own token.
- **Teacher view:** sign-in, classes, the class code and end date, classes ending within 30 days, "Show codes" (logged), "Reset PIN", "Reset placement", deleting a student or a class, "Import full export", and a note on what is kept and for how long. The class's data is turned into the same object local mode uses, so the Overview, Detail log, Workshop and both exports are the same.
- **Retention:** program code and output are cleared after 30 days (the hash, category, details and matches stay); classes are deleted after their end date. Both run nightly with pg_cron.

### How it fits together

| Part | Where |
|---|---|
| Tables, row-level security, server functions, nightly jobs | `supabase/migrations/0001_schema.sql` … `0004_retention.sql` |
| Class assignments: the `assignments` table, its row-level security, `attempts.assignment_id` | `supabase/migrations/0005_assignments.sql` |
| The Data types and casting unit (`data-types`) in every table's unit check | `supabase/migrations/0006_data_types_unit.sql` |
| The Strings, Random and Lists units (`strings`, `random`, `lists`) in every table's unit check | `supabase/migrations/0007_strings_random_lists_units.sql` |
| `join-class`, `resume` (no sign-in, 300 requests per IP per 10 minutes) | `supabase/functions/join-class/`, `resume/` |
| `student-api` (student session token): get/save progress (with the class's open assignments), get assignments, add attempts and events, mark passed, delete my progress | `supabase/functions/student-api/` |
| `teacher-api` (teacher's Supabase sign-in): reveal codes, reset PIN, reset placement, import | `supabase/functions/teacher-api/` |
| Shared function code: CORS, crypto, nickname filter, row checks | `supabase/functions/_shared/` |
| Student side | `backend.js`, with `backend-rows.js` (local records ⇄ table rows) |
| Teacher side | `teacher-backend.js`, with `backend-import.js` (reading a full export) |

Table and column names, and their values, are the full export's (for example `unit`, `student_code`, `result` = `skipped`, `record_type` = `placement_result`), so a row maps straight to an export row. `progress.state` holds a unit's whole saved state unchanged (`unit` = `endless` for Endless mode); `level`, `placement` and `completed` are read from it by the database. JSON columns are `json`, not `jsonb`, so they come back with their keys in the same order.

Anonymous users can't read or write any table. Teachers read their own classes directly, under row-level security, but can't see `pin_hash`, `login_lookup` or `login_code_enc`. Students never touch the tables: every student request goes through an Edge Function that checks their token.

### Setting it up locally

You need Docker Desktop and Node 18+.

```
npx supabase start
npx supabase functions serve --env-file <secrets file outside this folder>
```

See `docs/SECRETS.md` for making the secrets file. `config.js` (committed) points at the test project. To use the local stack instead, change it on your computer only, without committing: set `BACKEND_ENABLED: true`, `SUPABASE_URL: "http://127.0.0.1:54321"` and the anon key from `npx supabase status`, and serve the folder on port 8000 as above. Confirmation emails go to the local Mailpit inbox (http://127.0.0.1:54324). With `BACKEND_ENABLED: false` the app is in local mode.

### Class assignments (backend mode)

A teacher can set a group of tasks for a whole class: a title, a short description, and any bank tasks, in order (predict, Parsons, fill in the blanks and write; not placement tasks).

- **Students** see each open assignment as a card at the top of their home page, above the unit cards ("From your teacher"). Opening it shows the tasks one at a time, with the list down the side. They can go to any task in any order.
- **Practice only.** Nothing in the student's progress changes:
  - no score or pass count
  - no change to their level, streaks, passed tasks, skill states, hint counts or progress
  - unlimited tries, including on predict tasks: a wrong choice doesn't show the answer, so they can choose again
  - hints are free, with no count shown, and never move them down
  - "Show me how" is there on every task from the start, after any number of fails
  - **Reset this task** works as it does in practice
- **Recorded.** Every Check press and every use of "Show me how" goes into the same attempt log as practice, with `phase` = `assignment` and the assignment's id (`assignment_id`). The student's level is noted but never changed. Which task is open, the answers so far and the ✓ marks are kept in that browser only.
- **Teacher view → Assignments**: a list of the class's assignments, with a button to create one. For each assignment it shows:
  - which tasks have been tried, and by how many students
  - how many passed each task, the failed checks, the uses of "Show me how", the most common failure and the top misconception
  - the tasks students struggled with most (most students who tried without passing it yet, then most fails per student)
  
  The teacher can **change** an assignment (title, description, tasks) or **close** it. Students see only open ones. A closed one can be opened again, and its attempts are kept.
- **Storage:** the `assignments` table (migration 0005). Under row-level security only the class's teacher can read, add, change or delete its assignments. Students never read the table: `student-api` sends them the open assignments of their own class. An attempt may name only an assignment of the student's own class, which both `student-api` and a database trigger check. Assignments are deleted with their class.
- In local mode there are no assignments (the Assignments page says so), because students must see them on their own computers.

### Importing a full export

"Import full export" in the teacher view takes a `python-practice-full-data-*.csv` made in local mode. It lists every student in the file. Names are only trimmed: any that break the nickname rules, are blocked, or appear twice in the file must be renamed by the teacher, and nothing is saved until they all pass. A name already in the class adds its rows to that student. New students get a code and PIN, shown once.

It rebuilds each unit's level (the last level change, or the last attempt), the highest level, placement, passed tasks (by fingerprint, or task id when the export has none), units completed, level 10 passed and the buttons used. Old task ids are renamed with `former_ids` (for example `loops-L5a` → `while-L5a`, `sel-L10d` → `logic-L10b`); old skill names are renamed when the student next opens the unit. Assignment rows (`phase` = `assignment`) are imported without their `assignment_id`, and never rebuild a level or a passed task. It can't rebuild streaks, the fast-move-up run, a recovery ceiling, skill states, the per-task log and history, the task in progress or Endless mode choices. Code older than 30 days arrives already cleared. Importing the same file twice adds nothing (rows are matched on student, task, time and record type).

## Display: themes and reading overlay

The top bar of every page has:

- **A−/A+** to change the text size.
- **Theme:** Light, Dark or High contrast. On a first visit the app follows the computer's dark-mode setting. After that, the student's choice is remembered.
- **Overlay:** a translucent coloured layer over the whole page, for students who read more easily through a tint.
  - Tints: cream, pale blue, pale green, pale pink or grey, or off.
  - Strength: a slider from 5% to 60%.
  - It doesn't change any colours underneath, and it never blocks clicks or keyboard focus (`pointer-events: none`).
  - It sits over the theme, so a strong overlay lowers contrast. That trade-off is the student's choice.

Every colour comes from CSS variables, defined once per theme at the top of `styles.css`. The test script checks that each theme meets WCAG AA (4.5:1) for every text and background pair the app uses. It also fails if a hard-coded colour appears anywhere else in `styles.css`. Settings are saved in `localStorage` under `pySelectionPractice.settings.v1`.

## Code editor

Write tasks use [CodeMirror 5](https://codemirror.net/5/) (5.65.16, from cdn.jsdelivr.net) with the Python mode:

- line numbers, syntax highlighting in the theme's colours, and highlighting of matching brackets
- **Tab** inserts 4 spaces; **Shift+Tab** removes a level
- **Enter** keeps the indent, and adds a level after a line ending in a colon
- **Esc then Tab** (or Shift+Tab) leaves the editor; **Ctrl+Enter** checks the answer
- the draft is saved as the student types, as before

If CodeMirror can't be loaded, the page falls back to the plain text editor, which has the same Tab, Enter and Esc behaviour. Fill-in-the-blanks and Parsons tasks don't use the editor.

## Students and units

- **Name first.** On a student's first visit they are asked for their name (at least one character) before anything else. A stable student id is generated once and stored with the name.
- **"Not you? Change name"** in the top bar lists the students already saved in this browser, or lets a new student enter their name. Each name gets its own id, so two students called Sam don't share progress.
- **Unit menu.** `index.html` shows a card for each unit, in the order of `UNITS` in `curriculum.js` (the order in the table at the top), with its description, number of tasks and the student's level. Units with no tasks in `tasks.json` are greyed out as "Coming soon". Clicking a card opens `practice.html?unit=<id>`.
- **Progress is stored per student, per unit.**

### Test mode (`?test=1`)

With `?test=1` in the URL, the landing page shows a starting-level control. Pick a unit and a level (1–10) and press **Set level**. This:

- sets the current student's level in that unit only, and resets its streaks and ceiling
- keeps the student's attempt counts and history, buttons used and level 10 pass
- skips the placement test for that unit (shown as "Skipped" in the teacher view), unless it was already done
- is logged in the teacher view as "Set by the teacher in test mode"

Without `?test=1`, every new unit starts with the placement test.

Test mode also has **Mark unit completed**. It puts the student at Level 10 in that unit and marks it completed, so Endless mode and the from-scratch tasks can be tried without passing every level. The unit card glows as if a level 10 task had been passed. This is logged as well.

## Placement test

The first time a student opens a unit, they take a short placement test before practising. It starts with: "Quick check to find your starting point. Don't worry if it's tricky."

- **4 tasks**, one at each of levels 2, 5, 7 and 9 (`PLACEMENT_LEVELS`), in that order. All 4 are always given.
- **Up to 2 attempts on each** (`PLACEMENT_ATTEMPTS`). On a predict task, a wrong first choice gets "Not quite – you have one more try" without showing the answer. Hints are allowed and counted. A student can also skip a question, which counts as not passed.
- **Starting level** = the highest placement level passed, at least 1, at most `PLACEMENT_MAX_LEVEL` (8). Passing 2 and 5 but failing 7 starts at 5. Passing 9 starts at 8. Failing everything starts at 1. Because the highest pass counts, failing 2 but passing 5 also starts at 5.
- The cap applies only to placement. Practice can still take a student to level 10 by the normal rule.
- Placement attempts don't count towards the adaptive rule (streaks), but they are recorded, classified and matched like any other attempt.
- The result is shown once ("Quick check done – thank you! You'll start at Level 5 …") on the first practice task. Then it's straight into practice.
- **Taken once per unit.** A student resetting their own progress keeps their placement result and goes back to their placement starting level.
- **Teacher reset:** on the teacher view's Overview page, choose a student and unit and press **Reset placement**. The student takes it once more the next time they open the unit. Tasks they've already had are avoided, so they get different ones. The reset is logged.
- Placement tasks are tagged `placement` in `tasks.json` and are never used in normal practice. There are 2 per placement level per unit (48 in total), so one reset never repeats a task.
- Students who started a unit before placement existed don't take it ("Started before placement" in the teacher view).

## "This is too easy" and "This is way too hard"

Both buttons are shown below the hints on every practice task in a unit. They're not shown in placement or Endless mode.

- **This is too easy** moves the student up `BUTTON_JUMP_LEVELS` (1) level straight away. **This is way too hard** moves them down 1 level, never below 1.
- The current task is set aside (neither a pass nor a fail) and the next task is at the new level, with a short message such as "Great – let's try Level 6." or "No problem – let's try Level 4."
- Each can be used **once per unit**. After use it's greyed out with "Used for this unit". At Level 10 (or Level 1) the button that can't move is greyed out but not used up.
- The adaptive rule isn't changed. A button resets the unit's pass and fail streaks (and any recovery ceiling), so the normal rule carries on from the new level. The teacher's "fails in a row" count isn't reset.
- Each use is logged with the time, student, unit, task id, button, level before and level after. It also appears in the level-change log.

## "Show me how"

- **When:** after the 2nd failed attempt on the same task (`SHOW_HOW_AFTER_FAILS`), a **Show me how** button appears. It stays available after every later failure. Failed attempts are counted per task, per student, per unit, and the count is kept across visits (for a template variant, per fingerprint). It is not offered in placement.
- **What it shows:** a worked example on a similar problem in a different context (a zoo, a bakery, a cinema…), what it prints, the key idea, and then the key step for this task (the task's last hint).
- **Where the examples come from:** every practice task has a `worked_example` field (`problem`, `code`, `inputs`, `output`, `key_idea`), copied from `tools/worked-examples.js` for the task's unit and first skill by `node tools/add-worked-examples.js`, which also works out the output by running the code. Template variants use the worked example of their `source` task.
- **Effect on the level:** using it means the task can't be a strong pass, so it can't count towards moving up. It does **not** count towards the 3-hints move down, it doesn't move the student up or down, and it doesn't change the pass or fail streaks.
- **Afterwards** the same task is offered again at the same level: it stays on screen, or, if it had already ended unpassed (a wrong predict choice), a **Try this task again** button sets it again.
- **Logged** in the attempt log as a row with `record_type` = `hint` and `hint_type` = `show-me-how` (see the data dictionary).

## Never repeating a passed task

- Every task has a **fingerprint**: a bank task's id, or a template variant's template id plus its parameter values.
- The fingerprints of passed tasks are stored per student, per unit (`passedFingerprints`). **A passed fingerprint is never served again** in that unit, in practice or Endless mode. A student who resets their own progress keeps them.
- **Failed tasks may come back.** A failed template variant is remembered (`failedVariants`) so it can be set again.
- **Order within the student's level:** bank tasks not yet passed (never-seen first), then template variants failed before, then new template variants. The same task is never served twice in a row. New variants are drawn until one hasn't been passed (`MAX_NEW_VARIANT_TRIES` draws), so the pool doesn't run out.
- Derived variants need Python to work out their outputs, so the page says "Getting your next task ready…" for a moment while one is made. Bank tasks come first, while Pyodide loads.

## Glowing completion card

When a student passes a level 10 task in a unit, that unit's card on the landing page gets a glowing gold border and "★ Level 10 passed". This is separate from *completing* the unit (2 strong passes at Level 10, which unlocks Endless mode), though completing also turns the glow on.

- CSS only. The colours are the theme tokens `--glow` and `--glow-outer`, set for each of the Light, Dark and High contrast themes.
- The glow pulses gently. With `prefers-reduced-motion: reduce` it's a static glow with no pulsing.

## Progress summary (`progress.html`)

Linked as **My progress** on the landing page. There is one card per unit showing:

- the current level
- the percentage of the unit's practice tasks passed (different bank tasks passed at least once; placement tasks aren't counted)
- how many of the unit's skills are secured

Clicking a card opens a list of that unit's skills, each marked **Secured**, **In progress** or **Not started**.

- **Secured** means the student passed `SECURED_PASSES_IN_A_ROW` (2) tasks in a row that use the skill, with `SECURED_MAX_HINTS` (1) or fewer hints each time. Only tasks with that skill count towards the run. Once secured, a skill stays secured.
- **In progress** means they've tried at least one task with the skill.

Skills come from each task's `skills` field. Progress saved before skills were tracked is rebuilt from the student's history the first time it's loaded.

## Completing a unit, Endless mode and "Write from scratch"

**Completing a unit.** A unit is completed when the student meets the normal move-up rule at Level 10 (2 strong passes in a row there). They see a message, and the teacher's level log records it. Completing a unit unlocks two things for it:

- **Write from scratch:** in that unit's practice at Level 10, every 3rd task (`SCRATCH_EVERY_N_TASKS`) is a from-scratch challenge. It has a description, a blank editor and tests with random inputs. Each unit's challenges also use skills from the units before it. For example, Selection's use `str()`, `//` and `round()`.
- **Endless mode** (`endless.html`, linked from the landing page):
  - **Choosing units:** there's a checkbox for each unit, showing the student's level in it. Units not yet completed are greyed out with a message saying what's needed.
  - **Which task comes next:** a random ticked unit, at the student's level in that unit, by the same rule as practice (see "Never repeating a passed task").
  - **Combined tasks:** with 2 or more units ticked, there's a 35% chance (`ENDLESS_COMBINED_CHANCE`) that the next task is a combined one, using skills from two units. A combined task can be set when the student's level in each of its units is at least the template's level. The result counts in each of those units.
  - **Levels:** they move up and down by the same adaptive rule as normal practice. The mode never ends.

## Templates (`templates.json`)

A template is a task in the `tasks.json` format with `{{expression}}` placeholders, plus:

| Field | Meaning |
|---|---|
| `units` | `["maths"]`, or two units for a combined task |
| `params` | values drawn once per variant: `{"int": [lo, hi]}`, `{"choice": [...]}` or `{"sample": [[...], k]}` |
| `values` | derived values, as JS expressions, e.g. `"price * qty"` |
| `where` | optional condition; variants where it is false are redrawn |
| `test`, `testParams`, `testValues`, `testWhere`, `testCount`, `testCases` | one test template with its own random inputs, drawn `testCount` times. `testCases` adds fixed cases first, e.g. boundaries such as `{"m": "limit - 1"}`. An input can be `{"list": "expression"}` to give several inputs at once, for loops that read a different number of values in each test, e.g. `{"list": "prices.concat([0])"}` |
| `tests` | or a fixed list of tests |
| `shuffleOptions` | (predict) shuffle the options, so the right answer moves around |
| `source` | the bank task it was made from, or the closest one. Its worked example is used for "Show me how" |

- **Expected outputs** of these hand-written templates are worked out from the drawn values, not by running the solution. Helpers `pyround` (Python's `round`), `fl` (how Python prints a float), `idiv`, `mod` and `pylist` (how Python prints a list) keep them matching what Python prints. `pyRandom(inputs)` gives the same `randint()` and `choice()` results that a program gets when it is checked with those inputs (see [Random numbers when code is checked](#random-numbers-when-code-is-checked)).
- **Same seed, same variant.** The same template and seed always give the same task.
- **Every variant has a fingerprint:** its template id plus the values drawn for it (including the values drawn for its tests). A passed fingerprint is never served to that student again in that unit.
- **What's in the file:**
  - 549 derived templates, one made from each practice task (see below)
  - 60 single-unit templates, one per unit per level for the six units that came first (Data types, Strings, Random and Lists rely on their derived templates)
  - 43 combined templates. Every pair of units taught one after the other has at least 3: Output + Variables, Variables + Data types, Data types + Maths, Maths + Selection, Selection + Condition-controlled loops, both loops units together, Count-controlled loops + Strings, Strings + Random, and Random + Lists. Data types also has 3 with Count-controlled loops (from when it came after them), 3 with Strings, and Variables + Maths keeps its 3.
  - 30 from-scratch templates, three per unit

Templates are expanded by `templates.js`, which both the browser and the test script use.

### Templates made from the task bank (`"derived": true`)

`node tools/derive-templates.js` makes one template from every practice task (placement tasks stay a fixed bank with none). The template keeps the task's unit, level, type, skills, misconception tags and buggy variants. It changes the values and the context, so it tests the same idea with different numbers:

- **Numbers.** Every number in the code and in the tests becomes a parameter. They are all scaled by the same random factor and nudged a little, so they keep their order, sign and size: boundaries and branches mean the same thing. A boundary test (49, 50, 51 around a pass mark of 50) and a mistake's "one more" (`range(1, 4)` for `range(3)`) move with their number. `where` conditions throw away odd values: a 0 or 1 where there wasn't one, a negative age, values out of order.
- **Numbers that must not change** stay fixed: 0, 1, 2, 60, 24, 100, 365 and so on, facts of the topic (days in a week, the leap-year rule, π, the Fahrenheit formula), menu choices, and any number that breaks the solution when it changes on its own (for example how many values a loop reads). That last group is found by running the solution with each number changed.
- **Context.** First names, days, school subjects, colours, sports, foods, school places, year groups and form groups such as 7B are swapped for others from the same list.
- **The same change everywhere:** description, starter, solution, fill-in answers, Parsons distractors, hints and buggy variants. So a fill-in task keeps the same number and position of blanks, with the answers worked out from the new values. A Parsons task gets its distractors made again, so they still show the same misconception. A write task keeps its starter style and hints.
- **Expected outputs come from running the solution** (in Pyodide in the browser, with local Python in the tests). A "for example" output in the description is filled in from the variant's own output.
- **Predict tasks** get their wrong options from realistic mistakes: the task's buggy variants, and common-mistake changes to the program (`//` read as `/`, `>=` as `>`, `elif` as `if`, `range` including its stop, `int()` forgotten, both branches running, a print thought to be inside the `if`, and so on). The options are shuffled, and there is always exactly one correct option, as many options as the bank task had (at least 3).
  - Strings and Lists templates also get index and slice mistakes (counting from 1, a slice including its end), `upper()`/`lower()` swapped, a string method thought to change the string, `len()` one out or ignoring spaces, `find()` one out, and `in` read as `not in`.
  - Random templates also get `choice()` thought to give the whole list or string, and `randint()` thought to leave out its top number.
  - These rules apply only to templates of those units, so no other task's options change.
- **Checked when made:** a variant is thrown away, and the next draw tried, if the solution fails or doesn't use all its inputs, a buggy variant passes every test, a distractor equals a solution line, or a predict task can't get enough different wrong options.
- **Hand-written changes** (`OVERRIDES` in the tool) cover tasks the rules can't vary well: tasks about text with no numbers (linked lists of strings that change together, such as a country and its capital), hints that work through a sum (rewritten to use the variant's own values), and numbers that are facts.
- **Program runs are limited by lines, not time** (`MAX_LINES` in `templates.js`, using `harness.run_code_limited`), so a buggy variant that loops for ever stops quickly and in the same way in the browser and in the tests.

The tool reports any template that can't make 5 different variants, and lists numbers in a variant's text that its code, tests and outputs don't use, for a person to check. Run it again after changing a practice task.

## How difficulty works

### Levels: the same ladder in every unit

| Level | Task type | What the student does |
|---|---|---|
| 1 | Predict | Read a short program and pick its output |
| 2 | Predict | Wrong answers are built from common mistakes |
| 3 | Fill in the blanks | One blank (an operator, keyword or value) |
| 4 | Fill in the blanks | Two blanks |
| 5 | Parsons | Short puzzle, one distractor line |
| 6 | Parsons | Longer, two distractors based on common mistakes |
| 7 | Fill in the blanks | A whole line is blank |
| 8 | Write | Part of the program is given; write the rest |
| 9 | Write | Whole program from a description |
| 10 | Write | Extended program |

### Skills

Every task has 1–3 **skills** (the `skills` field), chosen from a fixed list for its unit in `curriculum.js`. The fast move up counts them, and the next task is chosen to have a different skill from the last one where possible.

| Unit | Skills |
|---|---|
| Output and sequence | print, strings, comments, sequence, sep/end |
| Variables and input | assignment, reassignment, input, int(), str(), concatenation |
| Data types and casting | integer, real, boolean, string, casting, type-choice |
| Maths in Python | arithmetic, division, integer-division, modulo, power, precedence, rounding |
| Selection | if, if/else, elif, comparison, boundary, and/or, not, input-conversion, modulo-conditions, input-validation, selection-in-functions |
| Condition-controlled loops | while, counter, accumulator, sentinel, input-validation, menu, and/or, infinite-loop |
| Count-controlled loops | for, range, loop-variable, step, nested-loop, counting, accumulator |
| Strings | length, indexing, slicing, upper/lower, find, replace, in |
| Random | import, randint, choice, simulation |
| Lists | list, indexing, append, length, list-loop |

In Selection, `selection-in-functions` tasks are only set from level 5 upwards (`skillMinLevel` in `curriculum.js`).

Each skill has one name everywhere. `indexing` and `length` are in both the Strings and the Lists lists, `accumulator` is in both loops units' lists, and `and/or` and `input-validation` are in both Selection's and Condition-controlled loops' lists. A skill that is in more than one list counts for the task's own unit, so a running total in a `while` task counts in Condition-controlled loops and one in a `for` task counts in Count-controlled loops. (Condition-controlled loops used to call these two skills `and-or` and `validation`; saved progress under the old names is moved to the new ones when it loads.)

**The loops units build on Selection.** Students already know `if`, `elif`, comparisons and `and`/`or`, so in each loops task the only new idea is the loop.

- **Condition-controlled loops** covers counting up and down, running totals, sentinel values ("keep asking until stop or 0"), input validation, `and`/`or` in the condition, repeating menus, selection inside a loop, and finding and fixing a loop that never ends. At level 10 it combines validation, a running total and a sentinel.
- **Count-controlled loops** covers `range(n)`, `range(start, stop)` (the stop isn't included), steps including negative ones, using the loop variable in a calculation, counting with an `if` inside the loop, nested loops, looping over the letters of a string, and asking how many times to repeat. It also includes tasks on choosing between `while` and `for`.
- **Contexts** are UK school ones: bus fares, library fines, game lives, shop totals, password attempts, quiz scores and register counts.

**Moved from Selection.** The 20 Selection tasks whose main idea was a `while` loop (`loops-L1a` … `loops-L10b`) and the placement task `sel-P9b` are now in Condition-controlled loops, renamed `while-L1a` … `while-L10b` and `while-P9a`. Each one keeps its old id in a `former_ids` field. A new Selection placement task, `sel-P9c`, replaces `sel-P9b`. `functions-L10a` stays in Selection, because its main idea is writing a function. Selection still has at least 18 tasks at every level.

**Data types and casting** (unit id `data-types`, task ids `types-L…`, placement `types-P…`) comes between Variables and input and Maths in Python, so it uses only casting, types, `+ - * /` and comparisons that give True or False: no `round()`, `if`/`else` or loops.

- **Replaced when it moved:** it was written to come after the loops units, so 11 tasks used `round()` (Maths) or `if`/`else` (Selection). `tools/replace-types-round-if.js` replaced them with tasks of the same level, type and skills: `types-L5c`, `L8a`, `L8b`, `L9a`, `L9b`, `L9c`, `L10a`, `L10b`, `L10c`, `P7a` and `P9b` became `types-L5d`, `L8d`, `L8e`, `L9d`, `L9e`, `L9f`, `L10d`, `L10e`, `L10f`, `P7c` and `P9c`. Each lists the old id in `former_ids` with `former_ids_are_replacements`, so older attempts still find it but its saved progress isn't moved across. The three from-scratch templates that used `round()` were replaced too (`scratch-types-trip-cost`, `scratch-types-height-check`, `scratch-types-receipt-type`). The combined templates with Maths and the loops units still use those units' ideas, because they're only set to students who have both units.
- **Exact real numbers:** where a task adds or multiplies real numbers, its tests use halves and quarters, which Python adds exactly, so no output looks like `0.30000000000000004`. Its derived template uses fixed sets of such values (`testSets` in `tools/derive-templates.js`) instead of scaling them.

- **What it teaches:** the four types in the spec: integer (`int`), real (Python's `float`), Boolean (`bool`) and string (`str`); choosing the right type for a value (a shoe size, a weight, a yes/no flag); and casting with `int()`, `float()`, `str()` and `bool()`.
- **The usual rules apply:** every task that reads a number casts it and says so; printing uses commas; the word *casting* appears in every task that converts a value.
- **Its levels follow the same ladder:**
  - Levels 1 and 2 predict `type()` and `7` vs `7.0`, the float a `/` gives, the comma's space, `int(input())`, and `bool("False")`.
  - Levels 3, 4 and 7 fill in a casting function or a whole casting line.
  - Levels 5 and 6 are Parsons puzzles where the distractors cast to the wrong type.
  - Levels 8 to 10 read values and cast each to a suitable type. Level 9 asks for a comment saying why a type was chosen, which the checker can't test.
- **Misconceptions:** two new ids, `INT_OF_DECIMAL_STRING` and `BOOL_CAST_TRAP`, alongside `INPUT_NOT_INT` and `STRING_PLUS_INT`.
- **Templates:** derived templates for predict tasks about `type()` get wrong options from four type mistakes, which apply only to programs that call `type()`:
  - a whole number read as a real number
  - a real number read as a whole number
  - quotes ignored
  - `type()` thought to show the value
- The tools that made the unit are `tools/add-data-types-unit.js` and `tools/add-data-types-templates.js`.

**Strings, Random and Lists** come after the loops units, in that order. Each has 32 practice tasks (4 at levels 1 and 2, 3 at every other level) and 8 placement tasks (2 at each of levels 2, 5, 7 and 9), on the same ladder as every unit. The Python stays within KS3 and J277, and none of them uses file handling, SQL, functions or recursion. Validation and authentication are not in these units.

- **Strings** (`strings`, task ids `str-L…`/`str-P…`): `len()`, indexing from 0, slicing (`[a:b]` stops before `b`), `upper()` and `lower()`, `find()` (and its `-1`), `replace()` and `in`. No `split()`, `join()`, `strip()` or other methods.
- **Random** (`random`, `rand-L…`/`rand-P…`): `import random`, `random.randint()` (both ends included) and `random.choice()` on a list or a string, used for dice, coins, picking teams and guessing games. No `random.seed()`, and no other functions. Predict tasks print the same thing whatever number comes up (for example "is the roll from 1 to 6?"), so the answer can be worked out.
- **Lists** (`lists`, `list-L…`/`list-P…`): making a list, indexing (and changing an item by index), `append()`, `len()`, and `for` loops over a list or its indexes. No list comprehensions, list slicing, `sort()`, `sum()`, `max()` or `min()`: totals and largest values are found with a loop, as in the GCSE.
- **Hints use the skill list's words:** a hint that names a skill says `len()`/length, indexing, slicing, `upper()`/`lower()`, `find()`, `replace()`, `import`, `randint()`, `choice()`, `append()` or loop, never another word for it (such as substring or array). The feature tests check this.
- **Every hint and rule from the other units applies:** casting is named wherever input is converted, printing uses commas, and text built with `+` and stored has a hint saying why.
- **Misconceptions:** six new ids (see [Misconceptions](#misconceptions)), alongside `INPUT_NOT_INT` and `STRING_PLUS_INT`. Their placement tasks have no buggy variants yet.
- **Templates:** every practice task has a derived template, with hand-written swaps in `tools/derive-templates.js` for the text-only tasks. Each unit has 3 from-scratch templates and 3 combined with the unit before it.
- **Tools:** `tools/add-strings-unit.js`, `tools/add-random-unit.js` and `tools/add-lists-unit.js` (using `tools/unit-tasks.js`), and `tools/add-strings-templates.js`, `tools/add-random-templates.js` and `tools/add-lists-templates.js` (using `tools/hand-templates.js`). Data types' templates with Strings are in `tools/add-data-types-templates.js`.

#### Random numbers when code is checked

A program that uses `random` prints different things on different runs, but the checker compares printed output. So when a program runs (Run or Check, in the browser, the tests and `recheck.py`), `harness.py` points the `random` module at a generator seeded from the test's first input:

- **The same test always gets the same numbers.** So Run shows exactly what the example test expects, and a correct program passes every time.
- **Tests with different first inputs get different numbers**, so a hard-coded answer fails the hidden tests.
- **Students never see or write a seed.** `random.seed()` isn't used in any task.
- **The generator is simple:** mulberry32, seeded with the FNV-1a hash of the first input. That's so `templates.js` can give the same numbers (`pyRandom`) and hand-written templates can work out what a program prints. A feature test checks that Python and JavaScript agree.
- **The order of the calls matters**, as it would with real random numbers. A program that asks for its two numbers the other way round, or picks from a list in a different order, gets different values from the expected output. So the Random tasks always say exactly which call to make, and in what order.
- **Programs that don't use `random` are unchanged.**

**Fewer repeated `sep=`/`end=` tasks.** At Output and sequence level 10, four tasks tested the same `sep=` or `end=` idea as a task kept at that level. They were replaced by comma tasks with the same level, type and skills, so the unit still has 14 tasks at level 10:

| Removed | Repeated the idea of | Replaced by |
|---|---|---|
| `out-L10e` (`sep=" \| "`) | `out-L10a` | `out-L10o` Sports day results |
| `out-L10k` (`sep=" - "`) | `out-L10a` | `out-L10p` Bus stop sign |
| `out-L10f` (`end=" \| "`) | `out-L10c` | `out-L10q` Club list |
| `out-L10h` (`end="... "`) | `out-L10c` | `out-L10r` Countdown in one print |

- At levels 1 to 9, each pair of `sep=`/`end=` tasks tests different ideas (one `sep=`, one `end=`), so they were kept. So were all the placement tasks.
- Each new task lists the old id in `former_ids`, with `former_ids_are_replacements: true`. The teacher view then shows an old attempt as "a removed task, replaced by …".
- Because the old task was a different task, its saved progress is **not** moved onto the new one: a student who passed `out-L10e` can still be given `out-L10o`. Imports and `recheck.py` also keep the old id.
- The tool that made this change is `tools/replace-sep-end.js`.

**Removed duplicate.** `sel-L10d` was the same rock, paper, scissors task as `logic-L10b`, so it was removed. `logic-L10b` lists `sel-L10d` in its `former_ids`, so older attempts and exports still find it, and saved progress on `sel-L10d` (including a task in progress) is merged into `logic-L10b` when it loads.

### Adaptive rules

A **strong pass** is a pass that used 1 hint or fewer, and not "Show me how". After each task, the first matching rule applies:

1. **3 or more hints** on one task: down 1 level, even if it was passed.
2. **Recovery drop:** a second fail in a row within 3 tasks of a level increase. The student goes down 1 level, and that level becomes their **ceiling** for the next 5 tasks. This brings back a student who jumped too far, without a bigger penalty.
3. **2 fails in a row:** down 1 level.
4. **Fast move up:** the 5th strong pass in a row, if those 5 tasks cover at least 3 different skills: up 2 levels.
5. **Normal move up:** 2 strong passes in a row: up 1 level.

The level never goes above 10 or below 1, or above the ceiling while one is in force. The two counters work independently: a normal move up resets the 2-pass count but not the 5-pass run. So 5 strong passes in a row over 3+ skills give +1, +1, then +2.

The student sees a short, positive message when their level changes, for example "You've moved up to Level 4!" or "Let's build up a bit more at Level 3."

**Pass and fail:**

- **Pass:** every test passes. A student can try as many times as they like.
- **Fail:** the student skips the task (after confirming), or chooses a wrong answer on a Predict task.

Time taken is not used anywhere in the rules.

Separately from the task result, every press of **Check** is recorded as an *attempt* (pass or fail) for the teacher view. A task can have many failed attempts before it is passed; only the task's result counts for the rules above.

### Automatic failure classification

Every failed attempt gets one category, worked out by `Checker.classifyAttempt` in `checker.js`. Students never pick a reason. The categories are checked in this order:

| Category | When | Details recorded |
|---|---|---|
| `SYNTAX` | The code won't compile (syntax or indentation error) | line number |
| `NAME` | A name is used before it is defined | the name, line |
| `TYPE` | An operation on incompatible types, e.g. text + number | the types, line |
| `TIMEOUT` | Stopped after 5 seconds, or printed far too much | – |
| `NO_ANSWER` | Empty editor, no blanks filled, no Parsons lines, or only comments / `pass` | – |
| `ORDER` | Parsons: exactly the right lines, in the wrong order or indentation | – |
| `OTHER_ERROR` | Any other runtime error: `ValueError`, `ZeroDivisionError`, asking for too much input … | error type, line |
| `WRONG_OUTPUT` | Runs, but the output doesn't match | which test, expected, actual |
| `WRONG_CHOICE` | Predict: the chosen option is wrong | chosen and correct options |

- **The student sees a friendly message for each category**, for example "Python couldn't find a name it expected ('scroe') on line 2. Check your spelling, and that you created it before using it." Every category message ends with one **"What to try"** line (`Checker.failureParts`). The existing plain-English error explanations are still shown underneath. A raw traceback is never shown.
- **A matched misconception comes first.** If the attempt matches a misconception, its `explanation` is the main message, above the category message.
- **The example test, if it fails,** shows the input used, the expected output and the student's output, each on its own labelled line ("Input", "Expected", "Your output"), with "(no output)" when nothing was printed.
- **A hidden test** shows only "Hidden test 2 passed" or "didn't pass", with the error explanation if the program stopped with one. Its input, its expected output and what the student's program printed for it are never shown, in any message, hint or explanation. A `WRONG_OUTPUT` failure on a hidden test gets its own message ("…didn't print the right thing for one of the hidden tests"). The attempt log still records the failing test's details for the teacher.
- **Empty answers count.** Checking an empty answer is now a failed `NO_ANSWER` attempt instead of being blocked. A fill task with *some* blanks empty is still blocked with "Fill in every blank".
- **What's stored.** With each failed attempt the app stores the category and details, the student's code, the output of the failing test (code and output cut to 2000 characters), that test's inputs and expected output, and any misconception matches.
- **`OTHER_ERROR`** was added to the 8 categories in the brief, for runtime errors that aren't `NAME`, `TYPE` or `TIMEOUT`.

### Misconceptions

`misconceptions.json` holds a fixed list of 24 misconception ids, each with a plain-English name, a short description (for teachers) and an `explanation` for students: 2 or 3 sentences saying what the mistake is and what to try next, without giving the answer.

- **Selection, maths and variables:** `EQUALS_VS_DOUBLE_EQUALS`, `SEPARATE_IF_VS_ELIF`, `BOUNDARY_LT_VS_LTE`, `GT_VS_GTE`, `MISSING_ELSE`, `INPUT_NOT_INT`, `PRECEDENCE`, `INT_DIV_VS_DIV`, `STRING_PLUS_INT`
- **Loops:** `LOOP_NO_UPDATE`, `LOOP_TEST_ONCE`, `LOOP_ZERO_RUNS`
- **Count-controlled loops (new):**
  - `RANGE_STOP_EXCLUSIVE`: thinks `range(1, 5)` includes 5
  - `RANGE_START_DEFAULT`: thinks `range(5)` starts at 5 (or at 1) rather than 0
  - `LOOP_VAR_ASSIGNED_IN_BODY`: changes the loop variable inside a `for` loop and expects that to change the loop
  - `NESTED_LOOP_WRONG_INNER`: the inner loop runs the wrong number of times, or the outer variable is reset inside it
- **Data types and casting (new):**
  - `INT_OF_DECIMAL_STRING`: casts text like `"3.5"` with `int()`, which stops with a `ValueError` (`float()` is needed)
  - `BOOL_CAST_TRAP`: expects `bool("False")` or `bool("no")` to be False, but any non-empty text is True
- **Strings, Random and Lists (new):**
  - `INDEX_FROM_ONE`: counts positions from 1 (`[1]` for the first item, `[len()]` for the last, or 1 added to `find()`), in Strings and Lists
  - `SLICE_END_INCLUSIVE`: expects a slice such as `[0:3]` to include index 3
  - `STRING_METHOD_NOT_SAVED`: expects `text.upper()` or `text.replace(...)` on its own line to change `text`
  - `RANDINT_STOP_EXCLUSIVE`: treats `randint()` like `range()`, for example `randint(1, 7)` for a dice
  - `RANDOM_STORED_ONCE`: expects a stored random number to change each time it's used, for example a roll made once before a loop
  - `APPEND_ASSIGNED`: writes `items = items.append(x)`, which leaves `items` as `None`

`LOOP_ZERO_RUNS` now also covers a `for` loop over an empty range, such as counting down with a positive step.

- **A task names up to 3 misconception ids in its `tags`.** Ids are the only all-capitals tags. Other tags are lower case, so the old `BIDMAS` tag is now `bidmas`.
- **A task may have `buggy_variants`**: short programs that each show one misconception (`{ "misconception": "GT_VS_GTE", "code": "…", "outputs": [...] }`).
- **How matching works.** When an attempt fails, the student's result on the first failing test is compared with each variant's result on the same test. A variant matches if both printed the same thing (ignoring trailing spaces) and ended the same way: no error, or the same kind of error (for example `TypeError:concat`, or a syntax error from `=` in a condition). Two runs that both went on forever also match, which is how `LOOP_NO_UPDATE` is found. If nothing matches, nothing is recorded: a misconception is never recorded without a match. `NO_ANSWER` attempts are never matched.
- **Variant outputs are worked out in advance.** `node tools/build-variants.js` runs every variant through `harness.py` on each of its task's tests and stores the results in `outputs`. The app and `recheck.py` compare against these stored outputs, so their results are identical. **Run it after adding or changing a variant or a task's tests.** The test script fails if the stored outputs are out of date.
- **Coverage now:** 211 tasks have misconception tags and buggy variants (268 variants in total):
  - **43 of the 80 placement tasks.** The 37 without variants are:
    - 7 Output and sequence tasks and 1 Variables task, whose ideas (`sep=`, `end=`, the order of statements, reassignment) have no id in the list yet
    - `for-P7a` (looping over a string), which has no matching id
    - 4 Data types tasks (`types-P2a`, `types-P2b`, `types-P7b`, `types-P7c`), whose mistakes (`/` giving a float, `*` on a string, a forgotten line) have no id
    - all 24 Strings, Random and Lists placement tasks (not written yet)
  - **168 bank tasks:** 21 in Selection, 21 in Condition-controlled loops, 29 in Count-controlled loops, 26 in Data types and casting, 9 in Variables and input, 11 in Maths, 20 in Strings, 15 in Random and 16 in Lists.
  - **Rules:** every id has variants on at least 3 bank tasks. Every id used in the loops units has variants on at least 3 bank tasks within those two units.
  - **Template variants:** a variant made from a bank task keeps its buggy variants, and their outputs are worked out when the variant is made (by running them), so mistakes on variants are matched too. The hand-written templates (Endless mode's single-unit and combined templates, write-from-scratch) have none.

All values are named constants at the top of `app.js`:

| Constant | Default | Meaning |
|---|---|---|
| `START_LEVEL` | 1 | Level a unit starts at (outside test mode) |
| `MAX_HINTS_FOR_A_STRONG_PASS` | 1 | A pass only counts towards moving up if it used this many hints or fewer |
| `PASSES_IN_A_ROW_TO_LEVEL_UP` | 2 | Strong passes in a row for a normal move up |
| `NORMAL_LEVEL_STEP` | 1 | Levels gained by a normal move up |
| `FAST_RUN_LENGTH` | 5 | Strong passes in a row for a fast move up |
| `FAST_MIN_DIFFERENT_SKILLS` | 3 | Different skills those tasks must cover |
| `FAST_LEVEL_STEP` | 2 | Levels gained by a fast move up |
| `FAILS_IN_A_ROW_TO_LEVEL_DOWN` | 2 | Fails in a row that move the student down |
| `HINTS_ON_ONE_TASK_TO_LEVEL_DOWN` | 3 | Hints on one task that move the student down |
| `DOWN_LEVEL_STEP` | 1 | Levels lost by a move down |
| `RECOVERY_WINDOW_TASKS` | 3 | Tasks after a level increase in which 2 fails cause a recovery drop |
| `RECOVERY_CEILING_TASKS` | 5 | Tasks for which the ceiling lasts |
| `SECURED_PASSES_IN_A_ROW` | 2 | Passes in a row on tasks with a skill to secure it |
| `SECURED_MAX_HINTS` | 1 | Hints allowed on each of those passes |
| `SCRATCH_EVERY_N_TASKS` | 3 | After completing a unit, how often a from-scratch task comes up at Level 10 |
| `ENDLESS_COMBINED_CHANCE` | 0.35 | Chance of a combined task in Endless mode with 2+ units ticked |
| `MAX_VARIANT_TRIES` | 10 | Tries to make a variant different from the last one |
| `MAX_HINTS_PER_TASK` | 3 | Hints available on a task |
| `RUN_TIMEOUT_MS` | 5000 | How long a run may take before it is stopped |
| `PLACEMENT_LEVELS` | 2, 5, 7, 9 | Levels of the placement tasks, in order |
| `PLACEMENT_ATTEMPTS` | 2 | Checks allowed on each placement task |
| `PLACEMENT_MAX_LEVEL` | 8 | Highest starting level placement can give |
| `BUTTON_JUMP_LEVELS` | 1 | Levels moved by "This is too easy" / "This is way too hard" |
| `SHOW_HOW_AFTER_FAILS` | 2 | Failed attempts on one task before "Show me how" is offered |
| `MAX_NEW_VARIANT_TRIES` | 40 | Draws to find a template variant that hasn't been passed |

## Expected output and example test

- **Every task except predict** shows a box labelled **Expected output** under its description. It holds the exact output the program should print for the **example test** (the task's first test), with that test's input. It is the same text the checker compares (`Checker.normalise`: trailing spaces and trailing blank lines are ignored). A task that prints nothing says "No output – the program should not print anything."
- The box also says how many **hidden tests** there are. Their inputs and outputs are never shown (see [Automatic failure classification](#automatic-failure-classification)). **Run** uses the example test's input.
- **Predict tasks have no box**, because the output is the answer.
- What counts as a pass hasn't changed: every test, hidden or not, must pass.
- The box comes from `task-view.js`, which the practice page and the teacher's Task browser both use, so they always show the same thing.

## Printing: commas and casting

- **Commas, not +.** When a program prints several values, it uses commas in `print()`: `print("Total (£):", total)`. No task joins values with `+` and `str()` just to print them. Where the old output had no space (`Total: £6`), the line was reworded so commas still read well (`Total (£): 6`), and the tests were changed to match.
- **+ only for text that is built and stored.** Where a task builds text with `+` and keeps it in a variable (a message, a badge, a row of a grid), a hint says why, in plain words. The same goes for an `input()` prompt built with `+`, because `input()` takes only one piece of text.
- **Casting is named.** Every task that applies `int()`, `float()` or `bool()` to `input()` calls it *casting*: in the description when the task asks the student to do it, otherwise in a hint.
- **Two predict tasks show why:**
  - `out-L1e` shows that commas print a space between values, with a no-space wrong option.
  - `var-L2e` shows text being joined (`"4" + "5"` is `45`) next to cast values being added (`9`).
- `tools/print-commas.js`, `tools/print-commas-templates.js` and `tools/casting-words.js` made these changes once. Each one checks that every changed solution still prints its expected output.

## Teacher view

**No student page links to it.** The student pages (`index.html`, `practice.html`, `progress.html`, `endless.html`) have no "Teacher view" link. Teachers open `teacher.html` at the site's address directly. A feature test checks that no student page, and no script one loads, links to it.

- **Backend mode:** `teacher.html` shows only the teacher sign-in form until a confirmed teacher signs in. A student who opens it sees that form and nothing else: no classes, no class data, and none of the student data cached in their browser. Their code and PIN don't work there, because students aren't Supabase users. A signed-in teacher sees only their own classes (row-level security). Teacher sign-up is still open, though: see Known limitations.
- **Local mode:** `teacher.html` has no sign-in. **Anyone who opens it can see all the data saved in that browser**: every student's name, levels, attempts and code. Removing the link only hides the page. This is a limit of local mode, not a security control.

`teacher.html` starts with the note "Data is stored in this browser only. Results from other devices won't appear here." It warns when the browser's storage is nearly full (about 4 of the 5 MB a site may use). It has five pages, each with its own link:

**Overview (`#overview`, the default)**

- **Quick look**, above the table:
  - students with 2+ fails in a row, and the task they're on
  - students who haven't started a unit
  - the 10 most-failed tasks, each with its failure rate, most common failure category and top misconception matched
  - the top misconceptions across the class, with the number of attempts and students affected
- **Student table**: one row per student, one column per unit. Each cell shows the current level, the placement result, **★ Complete** once a level 10 task is passed, and flags for "Too easy used", "Too hard used" and "⚠ 2+ fails in a row". "Fails in a row" is only reset by a pass, so it stays visible after the level drops.
  - Select any column heading to sort (unit columns sort by level); select it again to reverse.
  - Filter by name.
- **Reset placement** for one student in one unit (see Placement test).

**Detail log (`#log`)**

- One row per attempt (every Check press and every skip), per use of "Show me how" (result `show-me-how`) and per button use, newest first. Columns: time, student, unit, task id, level, result, failure category, misconception matches, hints used, button used, level change, and the code and output (with the expected output) under **Show**.
- Filter by student, unit, task, category and misconception. "(failed, no match)" shows failed attempts with no misconception match.
- Only the filtered rows are shown. The export options stay below.

**Workshop (`#workshop`)**

- For each misconception matched: the tasks it shows up in, the number of attempts and students affected, the failure rate on those tasks, and the list of students, to plan a workshop.
- For each task with failed attempts: the number of failed attempts with no misconception match ("unmatched"), the unmatched rate as a percentage of that task's failures, whether the task has buggy variants, and a **View** button. View shows those unmatched attempts with the code and output side by side, which helps when writing new buggy variants.

**Assignments (`#assignments`, backend mode)**: see [Class assignments](#class-assignments-backend-mode).

**Task browser (`#tasks`)**

- A search box finds a task by its id (`var-L9d`, in any case; an old id from `former_ids`; a template variant id like `d-var-L9d#123`; or an id with a number on the end like `var-l9d-2`) or by words in its title.
- For the chosen task it shows:
  - the question as students see it (for Parsons tasks, the lines they get)
  - the starter code
  - the **Expected output** box exactly as students see it (on predict tasks, which students see without the box, the output on its own)
  - every test, marked as the example or hidden (teacher only)
  - the hints
  - the **model solution** behind a Show / Hide button
- In backend mode, while an assignment form is open, an **Add to the assignment** button adds the task to it.
- Everything is read from `tasks.json`, the data the practice page uses. The browser is in `task-browser.js`, which only `teacher.html` loads, so no student page ever shows a model solution.

**Export** (below every page)

- **Export full data** downloads `python-practice-full-data-<date>.csv` with every attempt, skip, use of "Show me how", level change, button use and placement result (and reset) for the whole class, one row each. Two columns were added at the end: `hint_type` and `variant_fingerprint`. Then `assignment_id` was added after them, with the new `phase` value `assignment` (backend mode). Every earlier column and value is unchanged. The `record_type` column says which. It also downloads `data-dictionary.csv`, which explains every column and every coded value (record types, failure categories, error kinds, level-change reasons and misconception ids) in plain English, so an AI tool can analyse the data without other context. The browser may ask before allowing two downloads.
- **Export filtered view** downloads only what the current page shows: the student table with the name filter, the filtered detail log including code and output, or the two workshop tables.
- **All level changes**: every level change, newest first, with the reason, under a fold below the export buttons.

## Re-checking past attempts with new buggy variants (`recheck.py`)

`recheck.py` re-runs the misconception matching over every failed attempt in a full-data export. Use it to test new buggy variants against past data without running the trial again. It needs only Python 3: no browser, no Pyodide.

```
python recheck.py python-practice-full-data-2026-10-28.csv tasks.json
python recheck.py export.csv tasks.json -o rechecked.csv --misconceptions misconceptions.json
```

- It uses each variant's stored `outputs` from the tasks file, the same outputs the app used, so an unchanged export gives exactly the matches the app recorded.
- A variant with **no stored outputs yet** (for example one you have just added to a copy of `tasks.json`) is run with `harness.py` on the failing test's inputs, with the same 5-second limit as the app. Run `node tools/build-variants.js` later to store its outputs for the app.
- The output CSV (default `<export>-rechecked.csv`) keeps every row of the export. For failed attempts, `misconception_matches` holds the new matches, `previous_misconception_matches` the ones the app recorded, and `matches_changed` is `yes` where they differ. A summary of before/after counts for each misconception is printed.
- `--misconceptions` warns about variant ids that aren't in `misconceptions.json`.
- **Attempts on template variants** (task ids like `d-maths-L9b#1234`) are matched against the variant made again from `templates.json` (next to the tasks file, or `--templates`) with `node tools/expand-template.js`, so they keep their matches. This part needs Node.js; without it those attempts keep the app's matches and are marked `matches_changed` = `skipped`.
- **Moved tasks are found by their old id.** An export from before the move names them by the old id, for example `loops-L5a` instead of `while-L5a`. `recheck.py` finds them through `former_ids`, so those attempts keep their matches. The teacher view also uses `former_ids` to show such tasks' titles.
- To try a new misconception: add a variant to a copy of `tasks.json`, run `recheck.py` with that copy, and check the changed rows. If it works, add the id to `misconceptions.json`, add the variant to the real task (and its id to the task's `tags`), then run `node tools/build-variants.js` and `node tests/validate.js`.

## Adding tasks to `tasks.json`

`tasks.json` is an array of task objects. Every task needs these fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique. New units use `<unit prefix>-L<level><letter>`, e.g. `maths-L3a`, `while-L3a` or `for-L3a`. Selection keeps its original ids, e.g. `elif-L3a` |
| `unit` | string | `output`, `variables`, `maths`, `selection`, `loops-condition` or `loops-count` |
| `level` | integer 1–10 | Must match the ladder: levels 1–2 `predict`, 3–4 `fill`, 5–6 `parsons`, 7 `fill`, 8–10 `write` |
| `type` | `"fill"`, `"parsons"`, `"predict"` or `"write"` | |
| `title` | string | Short |
| `description` | string | What the student must do. Line breaks (`\n`) are shown |
| `starter` | string | Starting code (use `""` where not relevant) |
| `solution` | string | Reference solution. It must pass all of the task's tests |
| `tests` | array | `[{ "inputs": ["15", "yes"], "expected": "Adult" }]`. Inputs are strings, handed to `input()` in order |
| `hints` | array of 1–3 strings | Ordered from least to most revealing |
| `skills` | array of 1–3 strings | From the unit's skill list in `curriculum.js` |
| `tags` | array of strings | Contexts and misconceptions, e.g. `"= vs =="`, `"int() on input"`, `"money"`. Up to 3 misconception ids from `misconceptions.json` (all capitals, e.g. `"GT_VS_GTE"`); every other tag is lower case. `"placement"` makes it a placement task |
| `buggy_variants` | optional array | `[{ "misconception": "GT_VS_GTE", "code": "…" }]`. Each id must also be in `tags`. `outputs` is filled in by `node tools/build-variants.js` |
| `former_ids` | optional array | Old ids of a task that was moved to another unit, or of a duplicate merged into it, e.g. `["loops-L5a"]`. With `"former_ids_are_replacements": true` they are ids of different tasks this one replaced: the teacher view still finds them, but saved progress, imports and `recheck.py` don't treat them as this task. They must not be used by any current task. Keep them: `recheck.py`, the teacher view and the loading of saved progress use them, so older attempts and exports still find the task |
| `worked_example` | object (practice tasks) | For "Show me how". Filled in by `node tools/add-worked-examples.js`; edit the examples in `tools/worked-examples.js` |

Some types need extra fields:

- **`fill`**
  - `starter` contains `____` blanks: exactly 1 at level 3, exactly 2 at level 4.
  - At level 7, at least one blank must be a whole line, i.e. an answer containing a space.
  - `answers` lists the text for each blank, in order. The starter with the answers filled in must equal `solution` exactly.
- **`parsons`**
  - The lines of `solution` become the puzzle pieces. Indent with 4 spaces per level and leave no blank lines.
  - `distractors` holds wrong lines: exactly 1 at level 5 and exactly 2 at level 6. A distractor must not be identical to a solution line.
- **`predict`**
  - `solution` is the program shown to the student.
  - `options` holds 3–4 possible outputs, all different. Use `\n` for multi-line output and `""` for "nothing printed".
  - `answer` is the index of the correct option.
  - `tests` holds exactly one test, whose `expected` equals the correct option. Its inputs are shown to the student.
- **`write`**
  - At level 8, `starter` gives part of the program.
  - At levels 9–10, it is just a comment.

How outputs are compared:

- Only what the program `print()`s is compared. Prompts passed to `input("...")` are **not** part of the output.
- Trailing spaces on each line, and trailing blank lines, are ignored.
- Everything else, including capital letters, must match exactly.

To add a new unit:

1. Add it to `UNITS` in `curriculum.js`, with its skill list.
2. Add at least 30 tasks, with at least 3 for each of its 10 levels and every task type used, and 2 placement tasks at each of levels 2, 5, 7 and 9.
3. Add a worked example for each of its skills to `tools/worked-examples.js`, 3 from-scratch templates, and 3 combined templates with the unit before it.
4. **Backend mode:** add the unit id to `UNITS` in `supabase/functions/_shared/rows.ts` and to the unit checks in a new migration (as `0006_data_types_unit.sql` and `0007_strings_random_lists_units.sql` do). Deploy both before publishing the website, or the server refuses the new unit's work for good.
5. Add the unit id to the unit list checked in `tests/validate.js`.

Placement tasks are ordinary tasks with the `placement` tag, at level 2, 5, 7 or 9. Their ids use `P` instead of `L`, e.g. `sel-P7a` or `while-P2a`. Keep at least 2 per placement level in each unit.

**After editing, always run `node tools/build-variants.js` (if you touched buggy variants or tests), `node tools/add-worked-examples.js` (for a new practice task), `node tools/derive-templates.js` (to remake the templates made from the bank), then the test script.**

## Saved data and earlier versions

No `localStorage` key was renamed and no stored record changed shape. When a student's progress loads, `migrateProgress` in `app.js` brings it up to date and only adds to it:

- skills saved under their old names (`and-or`, `validation`) are merged into the new names
- the log and any task in progress for the removed duplicate `sel-L10d` are merged into `logic-L10b`
- `passedFingerprints` is filled in from the tasks already passed, and `failedAttempts` is counted from the student's attempt log
- `version` is set to 2. Running it again changes nothing.

`tests/fixtures/saved-data-v1.json` is a saved class (progress, attempts, level changes, button uses, placement results) in the format from before these changes, and `saved-data-v1-export.json` is the export that version gave. The feature tests load it, bring it up to date, and check that it still loads and exports every row it exported before, with the same values.

## Testing

```
node tests/validate.js
```

This needs Node 18+ and Python 3 on the PATH (set `PYTHON=...` to use a different interpreter). It makes about 7,100 template variants and runs about 41,000 Python programs, which takes 10 to 15 minutes. `node tests/validate.js --full` tries more seeds per template and runs the repeat rule for longer. As in the app, each program is stopped after 5 seconds (`tools/run-python.js`), so a buggy variant that loops forever without printing anything can't hang the tests. It checks:

- **Units:** every unit has at least 30 tasks, at least 3 per level (counting only tasks that can be set at that level) and every task type at least once. Selection keeps at least 100 tasks.
- **Task fields:** every task has the required fields, a valid unit, a valid level and type, and 1–3 skills from its unit's list. A task with no skill tag fails.
- **Templates:**
  - each template makes at least 5 different variants (from 20 seeds, or 16 for a derived template), and the same seed always gives the same variant; every variant has a fingerprint
  - every practice task has a derived template, and placement tasks have none; a derived template keeps its source task's unit, level, type, skills, misconception tags, buggy variants, number of blanks, distractors and options
  - every template's `source` is a practice task with a worked example
  - every pair of units taught one after the other has at least 3 combined templates
  - every variant passes all the task checks below, including running its reference solution against its tests
  - every unit has a template at every level and a from-scratch template, and there are at least 10 combined templates
  - each combined template uses a skill from each of its units
- **Contrast:** every text and background pair meets WCAG AA in the Light, Dark and High contrast themes, and `styles.css` has no hard-coded colours outside the theme blocks.
- **Level rules:** each level uses its ladder's task type, and the blank and distractor counts match the level.
- **Reference solutions:** each one passes its own tests and uses all of its inputs. They are run through `harness.py`, the same runner the browser uses.
- **Parsons tasks:** solutions still pass when rebuilt from loose lines plus indent levels.
- **Starters:** the starter code of write and fill tasks doesn't already pass.
- **Predict tasks:** no wrong option matches the real output.
- **Harness and error messages:** the input stub, too much output and too much input all behave correctly, and errors get friendly explanations with no traceback text.
- **Adaptive rules:** normal and fast moves up, the skill-variety condition, moves down for fails and hints, `failsInARow`, the limits of 1 and 10, the messages, and task choice (right unit and level, no repeats, `skillMinLevel`, varying the skill).
- **Progress and Endless mode:**
  - the Secured rule, and rebuilding skills from old history
  - completing Level 10, and the from-scratch schedule
  - Endless-mode choice: it never uses a unit that isn't completed, sets combined tasks only with 2+ units, makes variants once bank tasks run out, never gives the same task twice in a row, and never gives a passed fingerprint
- **Never repeating a passed task:** in practice (three units and levels) a passed task is never served again and the pool never runs out over many passes in a row; a failed bank task and a failed template variant can come back (but not straight after themselves).
- **Section 5 fixes:** `sel-L10d` is gone and `logic-L10b` keeps its id; no task uses an old skill name; `var-L10j` says "For 1 person"; `while-L6c`'s description is accurate. It also prints two reports: the Maths tasks containing `if`, `elif` or `else`, and the functions tasks at levels 1–4 using `selection-in-functions`.
- **Worked examples:** every practice task has one, it isn't the task's own solution, it shares no text with the task, and it's up to date.
- **Placement tasks and misconceptions:**
  - at least 2 placement tasks per placement level per unit
  - every misconception id is in `misconceptions.json`, with at most 3 per task, and each variant's id is in its task's tags
  - stored variant outputs are up to date, every variant fails at least one test, and predict variants give one of the wrong options
  - every id has variants on at least 3 bank tasks, and on at least 3 within the loops units for every id those units use
  - `former_ids` are unique and not used by a current task
- **Units and skills:** the units are listed in the order above (Data types between Variables and Maths; Strings, Random and Lists after the loops units), and a skill in two units' lists (`accumulator`) counts for the task's own unit.
- **Glow:** every theme has `--glow` and `--glow-outer`, and the glow doesn't pulse with reduced motion.
- **Feature tests** (`tests/features.js`, also runnable on their own with `node tests/features.js`):
  - **Placement:** passes 2 and 5, fails 7 → starts at 5; passes 9 → 8; fails everything → 1. It can't be repeated, and a teacher reset allows it once more with different tasks.
  - **Buttons:** each can be used once per unit, moves by `BUTTON_JUMP_LEVELS`, resets the streaks and logs the change.
  - **Classifier:** one fixture per failure category, each with a friendly message ending in one "What to try" line.
  - **Explanations:** every misconception id in `tasks.json` has an explanation of 2 or 3 sentences that contains no line of any solution.
  - **Saved data:** the saved class in `tests/fixtures` loads, is brought up to date (skills renamed, `sel-L10d` merged, counts filled in), and exports the same rows as before.
  - **"Show me how":** offered after the 2nd failure and every later one; a pass after it isn't strong; it isn't counted in the 3-hints move down; it's logged as a `show-me-how` hint and explained in the data dictionary.
  - **Matching:** an answer matching a buggy variant is tagged; one matching none is not.
  - **Data:** every misconception id used in tasks exists. The full export contains every attempt, level change, button use and placement result, and the data dictionary covers every column.
  - **Strings, Random and Lists:** the unit order; each unit's tasks per level, placement tasks, ids and skills; only the Python each unit teaches; no validation or authentication tasks; hints that name a skill use the skill list's word; the six new misconceptions; Random predict answers don't depend on the numbers; `harness.py` and `pyRandom` give the same numbers; the new error advice.
  - **Printing rule:** no task joins values with `+` and `str()` inside `print()`; every task that builds and stores text with `+` says why in a hint; every task that casts `input()` says "casting"; the two new predict tasks exist.
  - **Expected output:** every non-predict task's box shows the example test's output exactly as the checker compares it (or the "No output" line), never a hidden test's input or output, and says how many tests are hidden. A failed hidden test's message says nothing about it.
  - **Task browser:** search by id, title, old id and variant id; every test's expected output is the checker's and every model solution passes against it; it shows the same box as the student's page; the model solution starts hidden; no student page loads the browser.
  - **No teacher link:** no student-facing page (`index.html`, `practice.html`, `progress.html`, `endless.html`), and no script one loads, links to `teacher.html`.
  - **Assignments:** the assignment id goes into the attempt record, the row and the export (as the last column, with every earlier column unchanged) and the data dictionary; the per-task summary (tried, passed, struggled most); importing never rebuilds levels or passes from assignment work; assignment work is kept apart from the saved progress.
  - **`recheck.py`:** an unchanged export gives the same matches as the app (including an attempt on a template variant, made again from its template and seed); a new buggy variant changes the matches only for the attempts it applies to; an export that names a moved task by its old id keeps its matches.
- **Simulation:** `tests/simulate.js` runs nine made-up students through the rules. It checks the fast move up, the normal move down and the recovery drop with its ceiling, and that a student who uses "Show me how" twice doesn't change level because of it (compared with the same student without it). Run it on its own to see each student's level task by task:

  ```
  node tests/simulate.js
  ```

**Backend mode tests:**

- `node tests/backend-client.js`: `backend.js` against a fake server in memory (outbox, offline, signed out, shared computers, deleting). No network needed.
- The feature tests also check export parity: the same class exported in backend mode gives the same CSV, overview, quick look and detail log, and an imported export gives the same rows again.
- `node tests/sql/run.js`: row-level security and the server functions, in the local database (`npx supabase start`). Each file runs in a transaction that is rolled back. `assignments.sql` checks the assignments table: only the class's teacher can read or change its assignments, the table's checks, and that an attempt can only name an assignment of the student's own class. `data-types-unit.sql` and `strings-random-lists-units.sql` check that every table accepts the units added by 0006 and 0007 and still refuses unknown ones.
- `$env:TEST_BACKEND = "1"; node tests/backend/run.js`: the Edge Functions and the API on the local stack (also `npx supabase functions serve`). Set `FUNCTIONS_ENV_FILE` to the secrets file to test an expired token too. With `$env:TEST_BACKEND_TARGET = "test-project"` it runs against the test project named in `tests/backend/config.local.json` (git-ignored), and refuses any other project. It makes its own teachers and deletes them afterwards.

**In-browser check (optional):** serve the folder and open `http://localhost:8000/tests/browser-check.html`. It runs every bank solution, and one variant of every template (derived ones made in Pyodide, as the app makes them), through the real Pyodide worker. It also checks that an infinite loop is stopped by the timeout and by the line limit. Making the variants takes a few minutes.

## Files

| File | Purpose |
|---|---|
| `index.html`, `home.js` | Landing page: name screen, unit menu, links to My progress and Endless mode, test-mode controls |
| `practice.html`, `app.js` | Practice session for one unit, or Endless mode: task types, hints, the editor, the adaptive rules and their constants |
| `progress.html`, `progress.js` | Progress summary and skill drill-down |
| `endless.html`, `endless.js` | Endless mode set-up: choosing units |
| `teacher.html`, `teacher.js` | Teacher view (Overview, Detail log, Workshop, Assignments, Task browser) and export |
| `task-view.js` | The Expected output box and example test (practice page and Task browser), and the task search |
| `task-browser.js` | The teacher's Task browser, with the model solutions (loaded by `teacher.html` only) |
| `tools/add-data-types-unit.js`, `tools/add-data-types-templates.js` | One-off: the Data types and casting unit's tasks and templates (each checks its results) |
| `tools/add-strings-unit.js`, `tools/add-random-unit.js`, `tools/add-lists-unit.js`, `tools/unit-tasks.js` | One-off: the Strings, Random and Lists units' tasks, built and checked by the shared `unit-tasks.js` |
| `tools/add-strings-templates.js`, `tools/add-random-templates.js`, `tools/add-lists-templates.js`, `tools/hand-templates.js` | One-off: those units' combined and from-scratch templates, checked by the shared `hand-templates.js` |
| `tools/print-commas.js`, `tools/print-commas-templates.js`, `tools/casting-words.js`, `tools/replace-sep-end.js` | One-off rewrites for the printing rule (commas, casting), kept as a record; each checks its results |
| `teacher-data.js` | Teacher view sums, filters, full export and data dictionary (no DOM, so it's tested in Node) |
| `misconceptions.json` | The fixed list of misconception ids, names and descriptions |
| `recheck.py` | Re-runs misconception matching over an exported full-data CSV |
| `tools/build-variants.js` | Stores each buggy variant's outputs in `tasks.json` |
| `tools/run-python.js` | Runs programs through `harness.py` with local Python (used by the tests and the build tools) |
| `tools/derive-templates.js` | Makes a template from every practice task (and lists any it couldn't, or any text to check) |
| `tools/worked-examples.js`, `tools/add-worked-examples.js` | The worked examples for "Show me how", and the tool that copies them into `tasks.json` |
| `tools/expand-template.js` | Makes template variants again from their id and seed, for `recheck.py` |
| `tests/fixtures/` | Saved data in the earlier format, and the export it gave (data-safety test) |
| `store.js` | Everything saved in `localStorage` (progress, attempts, level, button and placement logs), plus the theme and overlay controls shared by every page |
| `curriculum.js` | Units, skill lists and the level ladder (shared) |
| `styles.css` | Shared styles and the three themes' colour tokens |
| `tasks.json` | The task bank |
| `templates.json`, `templates.js` | Task templates, and the code that turns a template into a task |
| `worker.js` | Web Worker that loads Pyodide and runs code |
| `harness.py` | Runs a program with test inputs and captures stdout (shared by the worker and the test script), with random numbers seeded from the first input |
| `checker.js` | Output comparison, plain-English error explanations, failure classification and misconception matching |
| `tests/validate.js` | Node test script (runs everything) |
| `tests/features.js` | Tests for placement, buttons, the classifier, matching, the export and `recheck.py` |
| `tests/simulate.js` | Simulation of the adaptive rules with made-up students |
| `tests/browser-check.html` | Optional in-browser check that uses the real Pyodide |
| `config.js`, `config.example.js` | The backend switch, project URL and public anon key (committed: no secrets), and a blank template |
| `backend.js`, `backend-rows.js` | Backend mode for students: sign-in, the cache and outbox, and record ⇄ row conversion |
| `teacher-backend.js`, `backend-import.js` | Backend mode for teachers: sign-in, classes, codes, PINs, and importing a full export |
| `backend/nickname-filter.json` | Words a nickname may not contain |
| `supabase/` | Migrations, Edge Functions and local config (`supabase/.temp/` is git-ignored) |
| `docs/SECRETS.md`, `docs/PRIVACY-NOTICE-DRAFT.md` | The Edge Function secrets (names only), and a privacy notice for the school to approve |
| `tests/backend-client.js`, `tests/sql/`, `tests/backend/` | Backend mode tests (see Testing) |

## Accessibility

- 18px base font, with A−/A+ buttons to change it. The setting is remembered.
- Light, Dark and High contrast (black, white and yellow) themes, all checked for WCAG AA text contrast, and a reading overlay. These are remembered too.
- Everything works from the keyboard:
  - visible focus rings and a skip link
  - **Ctrl+Enter** checks your answer
  - In the code editor, **Tab** indents and **Esc then Tab** leaves the editor
  - Parsons lines: **Enter** moves a line between lists, **Alt+↑/↓** reorders, **←/→** indents, **Delete** removes
- Task type is shown by a text label as well as a colour.
- Results are announced through an ARIA live region.

## Known limitations

- **Old progress is not carried over.** Progress saved by the previous version (per-category levels for Selection only) is ignored, so students start again.
- **The name is not a login (local mode).** Anyone using the browser can pick any name from the "Change name" list. It is there to keep progress apart on a shared computer, not to secure it. Backend mode uses a code and PIN instead.
- **The teacher view isn't protected in local mode.** Anyone who opens `teacher.html` in a browser can see all the data saved in that browser (names, levels, attempts and code), and reset placements. The student pages have no link to it, but that only hides it: it is not a security control. Backend mode needs a teacher sign-in.
- **Progress is per browser, per computer (local mode).** Clearing browser data deletes it. To collect results, export the full data on each machine.
- **Backend mode: the rate limit is per school network.** `join-class` and `resume` allow 300 requests every 10 minutes per IP address (`RATE_LIMIT_HITS` in `supabase/functions/_shared/limits.ts`). A whole school usually shares one public IP, so this is set for several classes signing in at once; the per-student PIN lock (5 wrong PINs, then 15 minutes) is the main protection.
- **Backend mode: `config.js` is committed.** It holds only the project URL and the public anon key, which are safe to publish because row-level security protects the data. The service-role key and the three Edge Function secrets are never in the repository (see `docs/SECRETS.md`). `BACKEND_ENABLED` is `false` until the backend has been deployed and tested.
- **⚠ Decide before the trial starts: who can be a teacher.** Teacher sign-up is open: **anyone with a confirmed email address can create a teacher account** and make classes. A teacher only ever sees their own classes, but nothing limits who signs up. This must be decided before the trial starts (for example, allowing only the school's email domain, or turning sign-up off in Supabase once the trial teachers have accounts).
- **Backend mode: an 8-hour student session.** After 8 hours the student signs in again. Work done in between is kept in the outbox and sent after they do.
- **Backend mode: the local stack's CORS headers.** Locally, Supabase's gateway answers with `Access-Control-Allow-Origin: *`; the functions themselves allow only `https://theogoescoding.github.io` and `http://localhost:8000`, and refuse other origins with 403. The exact headers can only be checked on a hosted project.
- **Storage is limited to about 5 MB per site.** Every attempt is stored, with code and output for failed ones (cut to 2000 characters each), up to 3000 attempts per student. On a shared computer used by a whole class this can fill up. The teacher view warns at about 4 MB; export the full data regularly.
- **Very long outputs are cut short in the export.** The app matches misconceptions on the full output, but stores only the first 2000 characters. So `recheck.py` could disagree with the app for an attempt that printed more than that without being stopped (endless loops are matched on how they ended, not their output, so they're not affected).
- **Variant outputs come from local Python, students' from Pyodide.** Matching compares printed output and a short, version-independent error label, not Python's own error text. Even so, a variant whose output differs between Python versions could match slightly differently in the browser.
- **Misconception matching covers bank and placement tasks with buggy variants, and the variants made from them.** The hand-written templates (single-unit, combined, write-from-scratch) are classified but never matched.
- **No misconception ids yet for Output and sequence ideas** such as `sep=`/`end=` or the order of statements, so most of that unit's placement tasks have no variants.
- **Placement uses the highest level passed**, as the brief says, even if an earlier one was failed. For example, failing 2 but passing 5 starts at 5.
- **Test mode is not protected.** Anyone who adds `?test=1` to the URL can set levels. Every change is logged in the teacher view.
- **Internet is needed the first time.** Pyodide comes from cdn.jsdelivr.net. If it can't load, the page says so and code can't be run.
- **Answers are visible to a determined student.** `tasks.json`, including the solutions and the hidden tests, is downloaded to the browser (in backend mode too: answers are still checked in the browser). No student page *shows* a model solution or a hidden test, but the data is there for anyone who opens the browser's developer tools.
- **Assignment work is kept per browser.** Which task is open, the answers so far and the ✓ marks on an assignment are kept in that browser only. The attempts themselves are saved to the server as usual, so the teacher sees everything, but a student who moves to another computer starts the assignment's tasks with empty answers.
- **Assignments need backend mode.** In local mode there are none.
- **Backend mode: deploy before publishing.** Each migration and the updated Edge Functions must be on the server before the website that uses them is published. Until 0007 is deployed (with `_shared/rows.ts` in `student-api`, `teacher-api`, `join-class` and `resume`), the server refuses all work in Strings, Random and Lists.
- **Random numbers repeat on purpose.** When code is run or checked, `random` gives the same numbers for the same test (see [Random numbers when code is checked](#random-numbers-when-code-is-checked)). Pressing Run again shows the same roll. A student who asks for random values in a different order from the task, or lists `choice()`'s items in a different order, fails even though the program is fine, so the tasks say exactly what to call and in what order.
- **Variants made from the bank need Python.** Their outputs are worked out by running them, so once a student has passed the bank tasks at a level, the next task waits for Pyodide to load (a few seconds on a first visit). If Pyodide can't load, only bank tasks and the hand-written templates can be set.
- **Variants change numbers and context words, not the whole story.** A variant of "Bus fares" is still about bus fares, with different ages and prices, and perhaps a different name or day. Text about a fixed thing (a rock, paper, scissors game, a canteen receipt) changes only through the hand-written lists in `tools/derive-templates.js`. The tool checks every variant runs and is consistent with its tests, and lists text numbers it couldn't account for, but a teacher should still read some variants for wording.
- **A passed task is never set again, even after a reset.** A student who resets their own progress gets new variants rather than the bank tasks they had passed.
- **Failed-attempt counts for old variants.** For attempts on template variants saved before fingerprints existed, the count for "Show me how" is rebuilt only for the hand-written templates (their variants can be made again without Python).
- **`recheck.py` needs Node.js for attempts on template variants.** Without it, those rows keep the app's matches.
- **Selection progress changed when the loop tasks moved.**
  - Passes on the moved tasks still count in a student's Selection history, but they no longer count towards Selection's "% of tasks passed".
  - A student partway through a moved task gets a new Selection task.
  - The `selection-in-loops` skill was removed from Selection. A skill state already saved for it is kept but no longer shown.
  - Those passes don't count towards Condition-controlled loops either, which starts with its own placement test.
  - A student who was halfway through a Selection placement test that included `sel-P9b` gets a replacement task for that step.
- **Tests check output, not how the code is written.** A program that gets the right output another way will pass. For example, a comment can't be checked, so Output and sequence tasks about comments are predict, fill or Parsons tasks.
- **Rounding output.** Maths tasks that round expect Python's `round()` output (e.g. `15.0`, not `15.00`), and say so in the description.
- **After a timeout, Python restarts.** The worker is stopped and a new one is started, and reloading Pyodide from the cache takes a second or two.
- **Error explanations are pattern-based.** Unusual errors get a general message that includes the Python error name. A raw traceback is never shown.
- **The editor needs the CDN.** Without cdn.jsdelivr.net the app falls back to the plain text editor, with no highlighting or line numbers.
- **The contrast check covers text, not the overlay.** A strong overlay over any theme lowers contrast, by the student's choice.
- **Template variants aren't hand-checked one by one.** The test script proves every variant's solution, expected output and starter are consistent, but a teacher should still read the templates for wording. In particular, "Write from scratch" and combined templates are hand-written; the 419 made from the bank are generated (see above).
- **Functions tasks below level 5.** `functions-L1a`–`functions-L4b` (8 tasks) use `selection-in-functions` at levels 1–4, although `skillMinLevel` keeps that skill to level 5 and above, so they are never set. They are left as they are until a decision is made.
- **Combined tasks move two levels.** A combined task's result counts in each unit it uses, so one fail in Endless mode can count towards a move down in two units.
- **Python versions differ slightly.** The test script uses your local Python, while the browser uses Pyodide 0.26.4 (Python 3.12).
- **Accessibility testing has limits.** Keyboard use has been tested automatically, but the app hasn't been tried with a real screen reader.
