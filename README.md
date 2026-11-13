# Python Practice (prototype)

A browser-based Python practice app for students aged 11–18: KS3, OCR GCSE Computer Science J277 (section 2.2, programming fundamentals, and the searching and sorting algorithms of section 2.1), and A-level (twelve units in the A-level group: programming techniques, then data structures). It has thirty-four units, in this order:

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
| Functions, no return value | `def`, calling a function, parameters and arguments, printing from inside a function | 32 | 8 |
| Functions, return values | `return`, using the result of a call, storing it in a variable | 32 | 8 |
| File handling | `with open(...)`, modes `"w"`, `"a"` and `"r"`, `write()`, `read()`, reading line by line, `close()` (predict, fill-in and Parsons tasks only) | 32 | 8 |
| 2D arrays | a list of lists, `grid[row][col]`, `len()` for rows and columns, nested loops | 32 | 8 |
| Validation | presence, length, range, format and type checks, asking again with `while`, a validation function | 50 | 8 |
| Authentication | usernames and passwords against stored ones, failed attempts, three tries, a login function | 30 | 8 |
| Trace tables | following a program line by line and filling in each variable's value and the output (trace table tasks only) | 30 | 8 |
| Linear search | checking each item in turn, a found flag, "not found", the position, counting matches | 41 | – |
| Binary search | a sorted list, the middle index, halving, moving `low` and `high` | 41 | – |
| Bubble sort | comparing pairs, swapping, passes, stopping when no swaps are made | 41 | – |
| Insertion sort | keeping the key, shifting bigger items, inserting into the sorted part | 41 | – |
| Merge sort | splitting in half, merging sorted lists, the leftovers (no recursion and no write tasks) | 41 | – |
| Recursion | a function that calls itself, base cases, recursion on numbers, lists and strings, values returned through the calls, loop versus recursion | 27 | 8 |
| Scope and parameters | local and global variables, `global`, passing numbers, strings and lists in, returning new values, mutable and immutable | 27 | 8 |
| Object-oriented programming: classes and objects | `class`, `__init__`, `self`, attributes, several objects in a list, the class versus an object | 26 | 8 |
| Object-oriented programming: methods | methods that read and change attributes, methods that return values, calls on several objects, a method without its brackets | 26 | 8 |
| Object-oriented programming: encapsulation | private attributes (`_name`), getters and setters, setters that check a value (as in Validation) | 26 | 8 |
| Object-oriented programming: inheritance and polymorphism | subclasses, `super()` in `__init__`, overriding, the same method called on different objects | 26 | 8 |
| Debugging | error messages (line and type), where a value first goes wrong, fixing one bug or several | 26 | 8 |
| Records and tuples | a tuple as a record, reading a field by index, unpacking, a tuple can't be changed (make a new one), lists of records | 26 | 8 |
| Stacks and queues | push, pop and peek (last in, first out), join and leave a queue (first in, first out), checking for empty, stack and queue classes, array stacks and circular queues with pointers | 26 | 8 |
| Linked lists | nodes with `data` and `next`, going along from `head` to `None`, adding at the front, after a node or at the end, deleting a node, searching | 26 | 8 |
| Hash tables | the hash `key % size`, storing keys, collisions, linear probing that wraps round, searching, hashing a word with `ord()` (lists only, no dictionaries) | 26 | 8 |
| 3D arrays | `cube[layer][row][col]`, the length of each level, three nested loops, building one whose rows are separate lists, totals and highest values | 26 | 8 |

The five searching and sorting units have no placement test: every student starts them at level 1. The twelve A-level units have a placement test, as the earlier units do.

On top of the task bank, `templates.json` holds 1549 task templates with randomised values: one made from every practice task (1306), plus 60 single-unit, 115 combined and 68 "Write from scratch" templates. A student never gets a task they have already passed: once the bank tasks at their level run out, they get new variants made from the templates.

- **Each unit has its own level (1–10) for each student.** Levels are about support, not topic: every unit runs from predicting the output (level 1) up to writing an extended program (level 10).
- **A placement test** finds each student's starting level the first time they open a unit.
- **Every failed attempt is classified automatically** (syntax error, wrong output, …) and matched against known **misconceptions**, so the teacher view can show who needs which workshop. The student sees the misconception's explanation and one thing to try next.
- **"Show me how"** offers a worked example after 2 failed attempts on the same task (before that the button is greyed out, with a tooltip).
- **An explainer** (the A-level units) names the idea behind a task in one sentence, once it is passed or straight after the second wrong check. See [The explainer](#the-explainer).
- **Every task shows its expected output** in a box, from one example test. The other tests are hidden.
- **Class assignments** (backend mode): a teacher sets tasks for a class, as practice only. See [Class assignments](#class-assignments-backend-mode).
- **A Task browser** in the teacher view shows any task's question, expected output, tests and model solution.
- **Student code runs in the browser.** It uses [Pyodide](https://pyodide.org) inside a Web Worker. A run is stopped after 5 seconds, so infinite loops can't freeze the page.
- **Two storage modes.** In **local mode** (the default) nothing leaves the browser: there is no backend or analytics, and names, progress and attempts are stored in `localStorage`. In **backend mode** (see [Backend mode](#backend-mode-supabase)) students join a class and their work is saved to a Supabase database, so they can carry on from any computer and the teacher sees the whole class. There are no analytics in either mode.

## Running it locally

The app must be served over HTTP. Opening `index.html` or `app.html` by double-clicking it won't work, because browsers block `fetch()` and Web Workers on `file://` pages.

From this folder:

```
python -m http.server 8000
```

Then open:

- Student app: http://localhost:8000/
- Teacher view: http://localhost:8000/teacher.html (pages: `#classes`, `#students`, `#assignments`, `#reports`, `#tasks`, `#settings`)
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
- **Teacher view:** sign-in, classes, the class code and end date, classes ending within 30 days, "Show codes" (logged), "Reset PIN", "Reset placement", deleting a student or a class, "Import full export", and a note on what is kept and for how long. The class's data is turned into the same object local mode uses, so the Students page, Reports and every export are the same.
- **Retention:** program code and output are cleared after 30 days (the hash, category, details and matches stay); classes are deleted after their end date. Both run nightly with pg_cron.

### How it fits together

| Part | Where |
|---|---|
| Tables, row-level security, server functions, nightly jobs | `supabase/migrations/0001_schema.sql` … `0004_retention.sql` |
| Class assignments: the `assignments` table, its row-level security, `attempts.assignment_id` | `supabase/migrations/0005_assignments.sql` |
| The Data types and casting unit (`data-types`) in every table's unit check | `supabase/migrations/0006_data_types_unit.sql` |
| The Strings, Random and Lists units (`strings`, `random`, `lists`) in every table's unit check | `supabase/migrations/0007_strings_random_lists_units.sql` |
| The two functions units, File handling and 2D arrays (`functions-basic`, `functions-return`, `file-handling`, `arrays-2d`) in every table's unit check | `supabase/migrations/0008_functions_file_arrays_units.sql` |
| The Validation and Authentication units (`validation`, `authentication`) in every table's unit check | `supabase/migrations/0009_validation_authentication_units.sql` |
| Trace tables and the five searching and sorting units (`trace-tables`, `linear-search`, `binary-search`, `bubble-sort`, `insertion-sort`, `merge-sort`) in every table's unit check, and the task types `trace` and `partial-parsons` in `attempts.task_type` | `supabase/migrations/0010_searching_sorting_trace_units.sql` |
| The seven A-level programming techniques units (`recursion`, `scope-parameters`, `oop-classes`, `oop-methods`, `oop-encapsulation`, `oop-inheritance`, `debugging`) in every table's unit check (the explainer is content only and needs no column) | `supabase/migrations/0011_a_level_programming_techniques_units.sql` |
| The five A-level data structures units (`records-tuples`, `stacks-queues`, `linked-lists`, `hash-tables`, `arrays-3d`) in every table's unit check | `supabase/migrations/0012_a_level_data_structures_units.sql` |
| A class's stage (`classes.stage`: `ks3`, `gcse` or `a-level`; existing classes become `gcse`) | `supabase/migrations/0013_class_stage.sql` |
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

See `docs/SECRETS.md` for making the secrets file. `config.js` (committed) points at the trial project (`bkcvigaqhawwaxtxyzec`). To use the local stack instead, change it on your computer only, without committing: set `BACKEND_ENABLED: true`, `SUPABASE_URL: "http://127.0.0.1:54321"` and the anon key from `npx supabase status`, and serve the folder on port 8000 as above. Confirmation emails go to the local Mailpit inbox (http://127.0.0.1:54324). With `BACKEND_ENABLED: false` the app is in local mode.

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
- **"Assignment complete" screen.** When the student passes the last task still needed (every task in the assignment has a pass, the same ✓ marks the home page counts), a dialog shows their breakdown, worked out from that browser's saved assignment work (nothing new is saved):
  - "8 of 8 tasks passed", the hints used and the attempts (Check presses), added up over the tasks
  - a grade, shown as a band: the percentage of tasks passed less `ASSIGNMENT_HINT_PENALTY` (2) points a hint, never below 0; `ASSIGNMENT_WELL_DONE_FROM` (80) or more **Well done**, `ASSIGNMENT_GETTING_THERE_FROM` (50) to 79 **Getting there**, under 50 **Keep practising** (all three numbers at the top of `app.js`). Attempts don't count.
  - **Go to this unit** (the unit of more than half of the tasks; with a tie or no majority this button isn't there) and **Back to units**. Neither is the default; the heading takes focus, Tab stays inside, Esc does the same as Back to units, and focus goes back to the task when it closes. It uses the same dialog code as the "Unit secured at 100%" pop-up.
  - Shown once, after the pass that completes the assignment: not on a reload, not for an assignment that was already complete, and never in practice, placement or teacher practice. The teacher view shows no grade.
- **Teacher view → Assignments**: a list of the class's assignments, with a button to create one. For each assignment it shows:
  - which tasks have been tried, and by how many students
  - how many passed each task, the failed checks, the uses of "Show me how", the most common failure and the top misconception
  - the tasks students struggled with most (most students who tried without passing it yet, then most fails per student)
  
  The teacher can **change** an assignment (title, description, tasks) or **close** it. Students see only open ones. A closed one can be opened again, and its attempts are kept.

  **Delete** removes an assignment for good. It asks on the page first ("Delete this assignment? Yes, delete / Cancel", never a browser dialog), and Cancel changes nothing. Only the assignment row is deleted: tasks, student progress and the attempt log stay. Attempts made on it keep `phase` = `assignment` but lose their `assignment_id` (the database sets it to empty), so they no longer count in an assignment's summary. Students stop seeing it the next time their app loads its assignments. Work done offline on a deleted assignment and sent afterwards is refused by `student-api` (it names an assignment the class no longer has).
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
- **Enter** indents in two cases only: after a line ending in a colon, one level (4 spaces) more than that line; after an indented line, the same indent. After any other line it adds a plain new line. CodeMirror's own Python indenting (`smartIndent`, and `electricChars`, which moved `else:` as it was typed) is off. The plain text box (if CodeMirror can't load) does the same (`enterIndent` in `app.js`).
- **Esc then Tab** (or Shift+Tab) leaves the editor; **Ctrl+Enter** checks the answer
- the draft is saved as the student types, as before
- **The starter comment** on a write-from-scratch task (a starter that is only comments, such as `# Write your program here`) goes on the first click or focus in the editor, if nothing has been typed yet. Pressing **Start task** puts the cursor in the editor, so on a practice task it goes then. The empty draft is saved, so it doesn't come back on the next visit. Code the student has typed is never changed. If a saved answer still begins with the comment, its lines are left blank in the code that is run and checked (`codeToRun`), so error line numbers still match the editor. A new copy of the task, or **Reset this task**, starts from the starter again.

If CodeMirror can't be loaded, the page falls back to the plain text editor, which has the same Tab, Enter and Esc behaviour. Fill-in-the-blanks and Parsons tasks don't use the editor.

## Students and units

- **Home page (`index.html`).** The first page every visitor sees. It shows the logo (`assets/logo/`) and the tagline "Climb through the units of Python programming, one rung at a time, with practice that adapts to you.", with **New student** and **Returning student** on the left and **New teacher** and **Returning teacher** on the right. On narrow screens it stacks as logo, student buttons, then teacher buttons.
  - The buttons only open the existing screens: `app.html#join` (join a class), `app.html#signin` (code and PIN), `teacher.html#signup` and `teacher.html#signin`. The home page has no sign-in code of its own. In local mode both student buttons open the name screen.
  - **It opens in the Dark theme** (with the dark logo) unless the visitor has chosen a theme. That default isn't saved, so the other pages still follow the system setting until the visitor picks a theme, which then applies everywhere.
- **The student view is `app.html`** (it used to be `index.html`). Its header shows the wordmark logo (the dark version in the Dark and High contrast themes), which links to the home page. Every page's tab icon is `assets/logo/icon-light.png`. Once signed in, a student's pages never link to the teacher view; only the home page does.
- **Name first.** On a student's first visit they are asked for their name (at least one character) before anything else. A stable student id is generated once and stored with the name.
- **"Not you? Change name"** in the top bar lists the students already saved in this browser, or lets a new student enter their name. Each name gets its own id, so two students called Sam don't share progress.
- **Unit menu.** `app.html` shows a card for each unit, with its description, number of tasks and the student's level, under five headings (`UNIT_GROUPS` in `curriculum.js`): **Programming fundamentals** (Output to Count-controlled loops), **Advanced programming** (Strings to 2D arrays), **Validation** (Validation, Authentication and Trace tables), **Searching and sorting** and **A-level**. A group can split its units into subsections (`subsections`), each under its own heading: the A-level group has two, **Programming techniques** (Recursion, Scope and parameters, the four object-oriented programming units, then Debugging) and **Data structures** (Records and tuples, Stacks and queues, Linked lists, Hash tables, then 3D arrays), and their unit cards' headings are one level lower (`h5`). A group with no units isn't shown. Within a group the units keep the order of `UNITS`. Each heading is a button that collapses or expands its group; groups start expanded, and a collapsed group is remembered on that device (`localStorage`, ignored if storage is blocked). Unit ids and saved progress don't depend on the groups. Units with no tasks in `tasks.json` are greyed out as "Coming soon". Clicking a card opens `practice.html?unit=<id>`.
- **Progress is stored per student, per unit.**

### No test mode

There used to be a `?test=1` starting-level control on the student's home page (Set level, Mark unit completed). It has been removed: a student can't set their own level or mark a unit completed, and `?test=1` does nothing on any student page. Every new unit starts with the placement test. Level changes made with it in the past are still shown in the teacher view and the exports, with their reasons `test-mode` ("Set by the teacher in test mode") and `test-mode-completed`.

## Placement test

The first time a student opens a unit, they take a short placement test before practising. It starts with: "Quick check to find your starting point. Don't worry if it's tricky."

- **Always 4 tasks** (`PLACEMENT_TASKS`), starting at level 2. The levels are 2, 5, 7 and 9 (`PLACEMENT_LEVELS`), in that order: in most units predict, Parsons, fill in the blanks (or write) and write.
- **A pass moves on a level; a fail gets a similar task.** A task is failed after 2 wrong checks (`PLACEMENT_ATTEMPTS`), or skipped. The next task is then another of the same kind at the same level (a failed predict gets another predict, a failed Parsons another Parsons), instead of the next level. In A-level units Parsons and partial-Parsons count as one kind. The student is told: "That one was tricky – that's fine. You'll get a similar task next.", and the next question says "This is a similar question to the last one."
- **No writing task after a failed predict.** With 4 tasks, the writing level is reached only by passing all four; where level 7 is already a writing task (Validation, Authentication, some A-level units), a student who failed the predict gets that level's other, non-writing task (A-level: the trace task) or, if there is none, another predict.
- **Where the retries come from.** Each level has 2 placement tasks. A retry of a kind whose placement tasks at that level have been given takes a practice task of that kind and level in the unit. No task is given twice in one placement, and the tasks of the student's last placement (before a teacher reset) are avoided where there's a choice. A practice task used like this changes nothing in practice: it isn't marked passed, its practice log and failed-check count aren't touched, and the student can meet it later in practice.
- **Up to 2 attempts on each.** On a predict task, a wrong first choice gets "Not quite – you have one more try" without showing the answer. Hints are allowed and counted. A student can also skip a question, which counts as not passed.
- **Starting level** = the level of the highest placement task passed, with no cap, or 1 if none was passed. Predict (pass), Parsons (fail), Parsons (pass), fill in the blanks (fail) starts at 5. Passing the level 9 task starts at 9. Failing everything starts at 1.
- Placement attempts don't count towards the adaptive rule (streaks) or the secured score (their phase is `placement`), but they are recorded, classified and matched like any other attempt.
- The result is shown once on the first practice task, with the questions passed and the start level ("Quick check done – thank you! You passed questions 1 and 3 of 4. You'll start at Level 5 …"). Then it's straight into practice. It is stored as before (`placement`: status, taskIds of the 4 tasks given, step, results, startLevel, used, finishedAt), so the teacher view and the exports read it unchanged.
- **Taken once per unit.** A student resetting their own progress keeps their placement result and goes back to their placement starting level.
- **Teacher reset:** on the teacher view, open the student (select their name on the Students page), choose a unit and press **Reset placement**. The student takes it once more the next time they open the unit. Tasks they've already had are avoided, so they get different ones. The reset is logged.
- Placement tasks are tagged `placement` in `tasks.json` and are never used in normal practice. There are at least 2 per placement level per unit (192 in total). After a teacher reset, the tasks already given are avoided where there's a choice (a retry takes an unused practice task before repeating one).
- Students who started a unit before placement existed don't take it ("Started before placement" in the teacher view).

## "This is too easy" and "This is way too hard"

Both buttons are shown below the hints on every practice task in a unit. They're not shown in placement or Endless mode.

- **This is too easy** moves the student up `BUTTON_JUMP_LEVELS` (1) level straight away. **This is way too hard** moves them down 1 level, never below 1.
- The current task is set aside (neither a pass nor a fail) and the next task is at the new level, with a short message such as "Great – let's try Level 6." or "No problem – let's try Level 4."
- Each can be used **once per unit**. After use it's greyed out with "Used for this unit". At Level 10 (or Level 1) the button that can't move is greyed out but not used up.
- The adaptive rule isn't changed. A button resets the unit's pass and fail streaks (and any recovery ceiling), so the normal rule carries on from the new level. The teacher's "fails in a row" count isn't reset.
- Each use is logged with the time, student, unit, task id, button, level before and level after. It also appears in the level-change log.

## "Show me how"

- **When:** the **Show me how** button is there from the start of the task, greyed out. After the 2nd failed attempt on the same task (`SHOW_HOW_AFTER_FAILS`) it works, and it stays available after every later failure. Failed attempts are counted per task, per student, per unit, and the count is kept across visits (for a template variant, per fingerprint). It is not offered in placement (no button), and in an assignment it works from the start.
- **Greyed out:** it uses `aria-disabled`, not `disabled`, so it can still be reached with Tab. A click does nothing but show the tooltip **"Available after two wrong attempts"**, which also shows on mouse hover, on keyboard focus and, on a phone, for 4 seconds after a tap (Esc hides it). A screen reader hears it as the button's description. The tooltip stays on screen on a phone (`tipLeft` in `app.js`). Passing the task leaves a greyed button greyed; a working button is hidden once the task is passed, as before.
- **What it shows:** a worked example on a similar problem in a different context (a zoo, a bakery, a cinema…), what it prints, the key idea, and then the key step for this task (the task's last hint).
- **Where the examples come from:** every practice task has a `worked_example` field (`problem`, `code`, `inputs`, `output`, `key_idea`), copied from `tools/worked-examples.js` for the task's unit and first skill by `node tools/add-worked-examples.js`, which also works out the output by running the code. Template variants use the worked example of their `source` task.
- **Effect on the level:** using it means the task can't be a strong pass, so it can't count towards moving up. It does **not** count towards the 3-hints move down, it doesn't move the student up or down, and it doesn't change the pass or fail streaks.
- **Afterwards** the same task is offered again at the same level: it stays on screen, or, if it had already ended unpassed (a wrong predict choice), a **Try this task again** button sets it again.
- **Logged** in the attempt log as a row with `record_type` = `hint` and `hint_type` = `show-me-how` (see the data dictionary).

## The explainer

Every task in the A-level units has an `explainer`: one short, plain-English sentence that names the idea and says what happened in this task (for example "Each call must pass a smaller number, n - 1, so the calls move towards the base case n == 0 and stop.").

- **When it is shown:** only once the task is passed, or straight after the second wrong check (`EXPLAINER_AFTER_WRONG_CHECKS` and `explainerShown` in `app.js`). It is never shown before that. A predict task in practice ends after one check, so there it appears after a pass; in an assignment (unlimited tries) it can appear after the second wrong choice.
- **Where:** in a box labelled "The idea" above the task's buttons, so it comes before the Skip option. It is hidden and empty until then.
- **Predict tasks:** the explainer never contains the right option's text, so it doesn't give the answer. `tools/unit-tasks.js` (`explainerProblems`) refuses one that does, or one that isn't a single sentence, and `tests/validate.js` checks every task and template variant.
- **Templates:** a derived template inherits the explainer, changed like its description (the same numbers and words), so it fits each variant. The hand-written A-level templates have their own.
- **Teacher view:** the Task browser shows it under the hints.
- **No database change:** it is content in `tasks.json` and `templates.json`. It isn't stored with attempts or exported.

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

**What a unit's score means.** The top of the page says: "A unit's score goes down a little each week unless you pass its level 10 challenge with no hints." Each unit card, and the unit's own page, then has one plain sentence from its [secured score](#secured-score) (`secured.js` `studentNote`, so it always matches the score on the unit cards):

- at 100%: "Secured. Keep it at 100% by doing a level 10 pass with no hints before Monday 16 November." The date is the last level 10 pass with no hints plus 7 days, the first day the score would drop (`keepByDate`). Once a unit can no longer drop (after five returns), it says "Secured. It stays at 100% now."
- between 50% and 90%: "Your score is 80%. A level 10 pass with no hints brings it back to 100%."
- not secured yet (including a unit whose quick check isn't done): "Reach level 10 and pass twice with no hints to secure this unit."

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
  - 677 derived templates, one made from each practice task (see below)
  - 60 single-unit templates, one per unit per level for the six units that came first (the later units rely on their derived templates)
  - 55 combined templates. Every pair of units taught one after the other has at least 3: Output + Variables, Variables + Data types, Data types + Maths, Maths + Selection, Selection + Condition-controlled loops, both loops units together, Count-controlled loops + Strings, Strings + Random, Random + Lists, Lists + Functions (no return value), the two functions units, Functions (return values) + File handling, and File handling + 2D arrays. Data types also has 3 with Count-controlled loops (from when it came after them), 3 with Strings, and Variables + Maths keeps its 3. Combined templates with File handling are fill-in and Parsons puzzles, like the unit.
  - 39 from-scratch templates, three per unit except File handling, which has none

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
  - Functions templates get a call left out, printed as text, or run twice; `def` thought to run the function straight away; a variable passed in quotes; `print()` instead of `return`; `return` left out; and a result not stored.
  - File handling templates get modes `"w"` and `"a"` swapped, `strip()` left out, `"\n"` left out or thought to be added by `write()`, and `readline()` read as `read()`.
  - 2D arrays templates get the index mistakes above, the row and column swapped, and `len(grid)` and `len(grid[0])` mixed up.
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

Some units change a few levels (`levelTypes` and `levelNames` in `curriculum.js`): File handling, Validation and Authentication (see below), Trace tables (a trace table at every level), and the five searching and sorting units, whose ladder is:

| Level | Task types | Tasks in each unit |
|---|---|---|
| 1–2 | Predict | 5 per level |
| 3–4 | Pick the missing line (`partial-parsons`) and predict | 4 and 2 per level |
| 5–6 | Fill in the blanks and trace table | 3 and 2 per level |
| 7–8 | Trace table and Parsons | 2 and 1 per level |
| 9 | Trace table and a short write | 1 and 1 (Merge sort: 2 trace tables) |
| 10 | Write the whole algorithm | 1 (Merge sort: a full trace of a longer list) |

A level can have two task types: `levelTypes` then gives a list, whose first type is the level's main one (`Curriculum.levelTypes()` gives the list, `levelType()` the main type). These units have fewer bank tasks at the top levels, so after the bank tasks are passed the student gets variants made from the templates.

The twelve A-level units share another ladder (`A_LEVEL_TYPES` in `curriculum.js`):

| Level | Task types |
|---|---|
| 1–2 | Predict |
| 3–4 | Fill in one blank, then two |
| 5–6 | Parsons (one distractor, then two), or pick the missing line |
| 7–8 | Trace table, or a short write |
| 9–10 | Write a full program, or a longer trace table |

Their number of tasks at each level follows from their coverage maps, so it differs from level to level (at least 2 practice tasks at every level).

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
| Functions, no return value | def, call, parameter, argument, print-in-function |
| Functions, return values | return, call, parameter, store-result |
| File handling | with-open, mode, write, read, lines, close |
| 2D arrays | list-of-lists, indexing, nested-loop, length |
| Validation | presence, length, range, format, type-check, re-ask, validation-function |
| Authentication | match, known-users, both-match, which-wrong, attempts, login-loop, presence, validation-function |
| Trace tables | trace-assignment, trace-output, trace-input, trace-selection, trace-loop, trace-list |
| Linear search | linear-search, found-flag, not-found, position, count-matches |
| Binary search | sorted-list, midpoint, halving, bounds, binary-search |
| Bubble sort | compare-pair, swap, pass, bubble-sort, early-stop |
| Insertion sort | key, shift, insert, insertion-sort, sorted-part |
| Merge sort | split, merge, compare-fronts, leftovers, merge-sort |
| Recursion | self-call, base-case, recursive-number, recursive-list, return-through, call-trace, loop-vs-recursion |
| Scope and parameters | local, global, pass-value, pass-list, mutable, param-or-global, scope-trace |
| OOP: classes and objects | class, object, init, self, attribute, object-list, class-vs-object |
| OOP: methods | method, change-attribute, return-method, method-call, method-brackets, method-trace |
| OOP: encapsulation | private, getter, setter, setter-check, direct-change |
| OOP: inheritance and polymorphism | subclass, inherit, super, override, polymorphism |
| Debugging | error-message, error-line, first-wrong-value, fix-bug, several-bugs, choose-line |
| Records and tuples | tuple, field-index, unpack, immutable, record-list |
| Stacks and queues | stack, queue, empty-check, stack-queue-class, pointers, stack-use |
| Linked lists | node, traverse, insert-front, insert-after, delete-node, search-list |
| Hash tables | hash-function, store-key, collision, linear-probe, hash-search, string-hash |
| 3D arrays | index-3d, len-3d, loop-3d, build-3d, total-3d |

In Selection, `selection-in-functions` tasks are only set from level 5 upwards (`skillMinLevel` in `curriculum.js`).

Each skill has one name everywhere. `indexing` and `length` are in both the Strings and the Lists lists, `accumulator` is in both loops units' lists, and `and/or` and `input-validation` are in both Selection's and Condition-controlled loops' lists. A skill that is in more than one list counts for the task's own unit, so a running total in a `while` task counts in Condition-controlled loops and one in a `for` task counts in Count-controlled loops. (Condition-controlled loops used to call these two skills `and-or` and `validation`; saved progress under the old names is moved to the new ones when it loads.)

**The loops units build on Selection.** Students already know `if`, `elif`, comparisons and `and`/`or`, so in each loops task the only new idea is the loop.

- **Condition-controlled loops** covers counting up and down, running totals, sentinel values ("keep asking until stop or 0"), input validation, `and`/`or` in the condition, repeating menus, selection inside a loop, and finding and fixing a loop that never ends. At level 10 it combines validation, a running total and a sentinel.
- **Count-controlled loops** covers `range(n)`, `range(start, stop)` (the stop isn't included), steps including negative ones, using the loop variable in a calculation, counting with an `if` inside the loop, nested loops, looping over the letters of a string, and asking how many times to repeat. It also includes tasks on choosing between `while` and `for`.
- **Contexts** are UK school ones: bus fares, library fines, game lives, shop totals, password attempts, quiz scores and register counts.

**Moved from Selection.** The 20 Selection tasks whose main idea was a `while` loop (`loops-L1a` … `loops-L10b`) and the placement task `sel-P9b` are now in Condition-controlled loops, renamed `while-L1a` … `while-L10b` and `while-P9a`. Each one keeps its old id in a `former_ids` field. A new Selection placement task, `sel-P9c`, replaces `sel-P9b`. `functions-L10a` stays in Selection, because its main idea is writing a function. Selection still has at least 18 tasks at every level.

**Data types and casting** (unit id `data-types`, task ids `types-L…`, placement `types-P…`) comes between Variables and input and Maths in Python, so it uses only casting, types, `+ - * /` and comparisons that give True or False: no `round()`, `if`/`else` or loops.

- **Replaced when it moved:** it was written to come after the loops units, so 11 tasks used `round()` (Maths) or `if`/`else` (Selection). `tools/archive/replace-types-round-if.js` replaced them with tasks of the same level, type and skills: `types-L5c`, `L8a`, `L8b`, `L9a`, `L9b`, `L9c`, `L10a`, `L10b`, `L10c`, `P7a` and `P9b` became `types-L5d`, `L8d`, `L8e`, `L9d`, `L9e`, `L9f`, `L10d`, `L10e`, `L10f`, `P7c` and `P9c`. Each lists the old id in `former_ids` with `former_ids_are_replacements`, so older attempts still find it but its saved progress isn't moved across. The three from-scratch templates that used `round()` were replaced too (`scratch-types-trip-cost`, `scratch-types-height-check`, `scratch-types-receipt-type`). The combined templates with Maths and the loops units still use those units' ideas, because they're only set to students who have both units.
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
- **Misconceptions:** six new ids (see [Misconceptions](#misconceptions)), alongside `INPUT_NOT_INT` and `STRING_PLUS_INT`. Their placement tasks have no buggy variants, by rule (as in every unit from here on).
- **Templates:** every practice task has a derived template, with hand-written swaps in `tools/derive-templates.js` for the text-only tasks. Each unit has 3 from-scratch templates and 3 combined with the unit before it.
- **Tools:** `tools/add-strings-unit.js`, `tools/add-random-unit.js` and `tools/add-lists-unit.js` (using `tools/unit-tasks.js`), and `tools/add-strings-templates.js`, `tools/add-random-templates.js` and `tools/add-lists-templates.js` (using `tools/hand-templates.js`). Data types' templates with Strings are in `tools/add-data-types-templates.js`.

**Functions (two units), File handling and 2D arrays** come after Lists, in that order, with the same 32 practice tasks (4 at levels 1 and 2, 3 at every other level) and 8 placement tasks each. None of them uses SQL, recursion, classes, list comprehensions or `import`.

- **Functions, no return value** (`functions-basic`, task ids `fb-L…`/`fb-P…`): level 1 starts gently (a function that prints, calling it twice, a function that is never called, one parameter). Then calls in loops, two parameters, an argument in quotes, and functions that call each other. No task uses `return`.
- **Functions, return values** (`functions-return`, `fr-L…`/`fr-P…`): `return`, using the result of a call (in a sum, a comparison, a print), and storing it in a variable. The traps include a function that forgets `return`, so printing its result shows `None` (`fr-L2a`), printing instead of returning, code after `return`, and a result that is never stored.
- **File handling** (`file-handling`, `file-L…`/`file-P…`): predict, fill-in and Parsons tasks only, with no write or from-scratch tasks. Pyodide has no real files, so every program makes its own file (opens it with `"w"`, writes, closes it, then opens it with `"r"` and reads it), and no task reads a file the student would have to supply. `with open(...) as file:` is the main pattern; a few tasks write `open()` and `close()` out. It covers modes `"w"`, `"a"` and `"r"`, `write()` (and that it adds no new line), `read()`, `readline()`, `for line in file:` and `strip()`.
  - **Its own levels 8 to 10.** Every other unit's levels 8 to 10 are write tasks, so this unit has `levelTypes` and `levelNames` in `curriculum.js`: level 8 is "Fill in two whole lines", and levels 9 and 10 are longer Parsons puzzles. `noScratch` means it never sets write-from-scratch tasks. `tests/validate.js` uses these instead of the usual ladder.
  - **Each program runs in its own empty folder** (`harness.py`), which is deleted afterwards, in the browser and in the tests. So a file can't last from one run, or one test, to the next, and nothing is written into the project folder.
- **2D arrays** (`arrays-2d`, `grid-L…`/`grid-P…`): a list of lists, `grid[row][col]` (reading and changing an item), `len(grid)` for rows and `len(grid[0])` for columns, and nested loops to read, total, search and print a grid. No `numpy` or other import.
- **Hints use the skill list's words** (`def`, call, parameter, argument, `return`, store, `with open`, mode, `write()`, `read()`, line, `close()`, list of lists, indexing, nested loop, `len()`), and the feature tests check every task.
- **Misconceptions:** ten new ids (see [Misconceptions](#misconceptions)), with `INDEX_FROM_ONE` and `INPUT_NOT_INT` used again. Their placement tasks have no buggy variants, by rule.
- **Error messages:** new advice for a missing file, reading a file opened to write (or the other way round), using a closed file, `write()` given a number, and a `None` from a missing `return`.
- **Tools:** `tools/add-functions-basic-unit.js`, `tools/add-functions-return-unit.js`, `tools/add-file-handling-unit.js` and `tools/add-arrays-2d-unit.js`; templates in `tools/add-functions-templates.js`, `tools/add-file-handling-templates.js` and `tools/add-arrays-2d-templates.js`.

**Validation and Authentication** come after 2D arrays, in the Validation group, in that order. Both use their own ladder (`levelTypes` and `levelNames` in `curriculum.js`): levels 1–2 predict, 3–4 fill in the blanks, 5–6 Parsons, 7–8 write a short check ("Write a short check", "Write a longer check"), and 9–10 write a full program. Each has 8 placement tasks (2 at each of levels 2, 5, 7 and 9, as in every unit), with no buggy variants.

- **Validation** (`validation`, task ids `val-L…`/`val-P…`): 50 practice tasks, 5 at each level, one for each kind of check. The id's last letter says which: `i` presence, `l` length, `r` range, `f` format, `t` type (skills `presence`, `length`, `range`, `format`, `type-check`, each task's first skill). Each task has one or two tests: where there are two, one answer passes the check and one fails it. It uses `input()`, `.strip()`, `len()`, comparisons, `and`/`or`/`not`, `in`, `.isdigit()`, `int()` after the check, `while` to ask again, and at level 10 a function that returns `True` or `False`. Format checks also use indexing and slicing from Strings (`phone[0] == "0"`, `text[:2].isdigit()`).
- **Authentication** (`authentication`, `auth-L…`/`auth-P…`): 30 practice tasks, 3 at each level, each the same step with different stored details and inputs: a username match with `==`, a password match, `in` a list of known usernames, both with `and`, a login message (Parsons), a counter of failed attempts (Parsons), which part was wrong, three attempts with `while`, a presence check before the login, and a login system with `check_login()` returning `True` or `False`. Everything is simulated: the stored usernames and passwords are variables or plain lists in the program.
- **Out of scope in both:** `try`/`except`, password hashing, `.isalpha()`, `.startswith()`, regular expressions, dictionaries, files and databases. The feature tests check this.
- **Misconceptions:** seven new ids (see [Misconceptions](#misconceptions)): `AND_OR_CONFUSED`, `REASK_CONDITION_UNCHANGED`, `ISDIGIT_NEGATIVE`, `IN_NOT_EQUALS`, `EMPTY_AFTER_CAST`, `USERNAME_CASE_MISMATCH` and `ATTEMPTS_NOT_COUNTED`, each on 3 or more tasks. Existing ids are used again where they fit: `EQUALS_VS_DOUBLE_EQUALS` (`=` in a login check), `BOUNDARY_LT_VS_LTE` and `GT_VS_GTE` (an end value of a range), and `INPUT_NOT_INT`. The `=` variants are matched by their own error (`SyntaxError:assign-in-condition`), so `tools/unit-tasks.js` accepts that one syntax error in a buggy variant and still refuses any other.
- **"Show me how":** a worked example for every skill, in `tools/worked-examples.js`: each kind of check, each Authentication step, the re-ask loop (Validation level 8 tasks that ask again have `re-ask` as their first skill) and the validation function (Validation level 10 tasks have `validation-function` first).
- **Templates:** every practice task has a derived template (the text-only ones with hand-written swaps or test sets in `tools/derive-templates.js`). Each unit has 3 write-from-scratch templates and 3 combined with the unit before it (2D arrays + Validation, Validation + Authentication).
- **Worked examples use their own context** (a swimming club, a bowling alley, a games console, a safe), so no prompt or message is the same as a task's: `tests/validate.js` checks this for every task.
- **Tools:** `tools/add-validation-unit.js` and `tools/add-authentication-unit.js` (using `tools/unit-tasks.js`); templates in `tools/add-validation-templates.js` and `tools/add-authentication-templates.js`.

**Trace tables** (`trace-tables`, task ids `trace-L…`/`trace-P…`) comes after Authentication, in the Validation group. Every task is a trace table (see [Trace tables and pick the missing line](#trace-tables-and-pick-the-missing-line)), 3 at each level, with 2 placement tasks at each of levels 2, 5, 7 and 9:

- Levels 1–2: a program of 1–3 lines, the whole table to fill in (level 2 has traps: a copy that doesn't follow, `//`, text that looks like a number).
- Levels 3–4: a longer program with most of the table given: fill in the blanks (`blanks` in the task's trace spec).
- Levels 5–6: programs with input.
- Levels 7–8: selection. The Line column is asked too, so the student works out which lines run.
- Level 9: a loop. Level 10: a full table of about 15 rows.
- It has no write tasks, so `noScratch`. Existing misconceptions are used where they fit (`INT_DIV_VS_DIV`, `GT_VS_GTE`, `SEPARATE_IF_VS_ELIF`, `AND_OR_CONFUSED`, `RANGE_STOP_EXCLUSIVE`).

**Searching and sorting** is the last group: Linear search (`lin-L…`), Binary search (`bin-L…`), Bubble sort (`bub-L…`), Insertion sort (`ins-L…`) and Merge sort (`mer-L…`), 41 tasks each on the ladder above. They have `noPlacement` in `curriculum.js`, so a student starts each at level 1 (the unit's placement is stored as `null`, as for a unit started before placement existed).

- **The same names in every task:** `found`, `pos` and `-1` for not found; `low`, `high` and `mid = (low + high) // 2`; `swapped` and `temp`; `key`, `i` and `j`; `left`, `right` and `merged`. From level 7 up, every list has at least 5 items (a merge's two lists together).
- **No recursion in these tasks.** Merge sort has one short note (`note` in `curriculum.js`, shown on its card): "Merge sort uses recursion, which is an A-level topic. You can learn more about it in the Recursion unit." The tasks themselves practise splitting, merging two sorted lists, and a "bottom-up" merge sort that merges runs of 1, then 2, then 4. Merge sort has no write tasks (`noScratch`): level 9 is two trace tables and level 10 a full trace of eight items.
- **Misconceptions:** eleven new ids, each with buggy variants on 3 or more tasks in its unit: `LINEAR_NOT_FOUND_MISSING`, `LINEAR_STOPS_EARLY`, `BINARY_UNSORTED`, `BINARY_BOUNDS_NOT_UPDATED`, `BINARY_MID_FLOAT`, `BUBBLE_RANGE_OFF_BY_ONE`, `BUBBLE_SWAP_NO_TEMP`, `INSERTION_OVERWRITES`, `INSERTION_KEY_NOT_KEPT`, `MERGE_ITEMS_LOST` and `MERGE_NO_COMPARE`. `INDEX_FROM_ONE`, `GT_VS_GTE`, `INT_DIV_VS_DIV` and `RANGE_STOP_EXCLUSIVE` are used again where they fit. `BINARY_BOUNDS_NOT_UPDATED` variants may run for ever (as `LOOP_NO_UPDATE` ones may): that is how the mistake shows.
- **"Show me how":** each unit has one worked example for each task type it uses (`unit:type` keys in `tools/worked-examples.js`, found before the skill keys), and a trace table example shows its whole table. Trace tables has one for each skill.
- **Templates:** every practice task has a derived template. Their text keeps its line, row and index references ("Line 4", "items[3]", "index 2") as they are, since scaling the numbers in order doesn't move any position, and the list mistakes (an index one out, a slice end) give predict tasks their wrong options. Linear search, Binary search, Bubble sort and Insertion sort have 3 write-from-scratch templates each, and each new pair of units taught one after the other has 3 combined templates (`tools/add-searching-sorting-templates.js`).
- **Tools:** `tools/add-trace-tables-unit.js`, `tools/add-linear-search-unit.js`, `tools/add-binary-search-unit.js`, `tools/add-bubble-sort-unit.js`, `tools/add-insertion-sort-unit.js` and `tools/add-merge-sort-unit.js` (using `tools/unit-tasks.js`). The casting sentences in their input tasks are in those scripts, so building them again gives the same `tasks.json`.

**A-level: Programming techniques** is the first subsection of the last group (`a-level`, subsection `programming-techniques`): Recursion (`rec-L…`/`rec-P…`), Scope and parameters (`scope-…`), Object-oriented programming: classes and objects (`cls-…`), methods (`meth-…`), encapsulation (`enc-…`), inheritance and polymorphism (`inh-…`), then Debugging (`dbg-…`). Each has 26 or 27 practice tasks on the A-level ladder above, and 8 placement tasks (2 at each of levels 2, 5, 7 and 9) with no buggy variants.

- **Coverage maps:** each unit's script (`tools/add-<unit>-unit.js`) has a `COVERAGE` list: each angle of the unit and the tasks that cover it. The feature tests check that every angle has tasks and every task id exists.
- **Taught in lessons, not in the app:** bitwise operations and trees (binary trees included). **Out of scope (in these seven units):** data structures (now in the next subsection), quick sort, Boolean logic, graphs, Big O, computational methods, the programming project, pseudocode, SQL, web technologies and Little Man Computer. No `try`/`except`, dictionaries or libraries beyond the earlier units'.
- **Trace tables with objects:** `harness.trace_code` gives each attribute of an object made from a class in the program its own column (`acc.balance`), so the object-oriented units have trace tasks. A trace table records only the main program's lines, so recursion is traced through what the calls print (the Output column) and the values the main program stores.
- **Debugging:** a predict task's program must run, so levels 1–2 predict what a program with a bug prints and where the mistake first shows. Levels 3–4 show a program that stopped, with its line numbers and error message, in comments, and the student fills in the line and the type of error. Its write tasks start from the program with the bugs in it, so it has no write-from-scratch tasks (`noScratch`).
- **A method named without brackets is never printed** (that shows a memory address, different each run): it is used where its effect is the same every time (it does nothing, counts as True, or gives a TypeError).
- **Misconceptions:** twelve new ids (see [Misconceptions](#misconceptions)), each with buggy variants on 3 or more bank tasks. `RETURN_MISSING_NONE` is reused for a recursive call whose result isn't returned (no `RECURSION_RETURN_MISSING`), and `INDEX_FROM_ONE`, `RESULT_NOT_STORED`, `PRINT_INSTEAD_OF_RETURN`, `GT_VS_GTE`, `BOUNDARY_LT_VS_LTE`, `AND_OR_CONFUSED`, `IN_NOT_EQUALS`, `RANGE_STOP_EXCLUSIVE` and `STRING_PLUS_INT` where they fit.
- **Error messages:** clearer advice for a function that never reaches a base case (`RecursionError`), an object without an attribute (`AttributeError`, mentioning `self.` and `super().__init__`), and a method without `self`.
- **"Show me how":** one worked example for each task type in each unit, in contexts of their own (planets, museums, gardens, ferries).
- **Templates:** every practice task has a derived template (text-only tasks have swaps or test sets in `tools/derive-templates.js`; the line numbers a task names stay fixed). Wrong predict options also come from object mistakes (an attribute's name printed, a change that doesn't happen, a method without brackets). Each new pair of units taught one after the other (Merge sort + Recursion, then each A-level pair) has 3 combined templates, and each unit but Debugging a write-from-scratch template (`tools/add-a-level-templates.js`).
- **Merge sort's note** points students to the Recursion unit (merge sort uses recursion, an A-level topic); the Merge sort tasks themselves don't use it.
- **The recursive function must call itself** in `rec-L8a` (Recursion instead of a loop), `rec-L10a` (Biggest, two ways) and the tasks made from the three templates built on them. Each asks for a recursive function (two of them next to a loop one), and a loop can print the right answer too, so on Check the app also looks at the code (`checker.js` `recursionProblem`). A task is matched by its base id, the part before any `#` (a template's tasks are `d-rec-L8a#123` and so on); the five base ids are `rec-L8a`, `rec-L10a`, `d-rec-L8a`, `d-rec-L10a` and `scratch-rec-power`, and no other task is checked. The function that must recurse is the one that calls itself in that task's own model solution (`power_rec`, `biggest`, `biggest` again, and `power` for the write-from-scratch task). It must be defined, and its body must call it by name; a call only in a comment or a string doesn't count. If not, the attempt fails with "Your function power_rec needs to call itself. Put a call to power_rec inside its own body." (with that task's function name). This applies to every pass, including level 10 passes, endless mode and assignments. The earlier gap, where a loop still passed the template copies, is closed.
- **Tools:** `tools/add-recursion-unit.js`, `tools/add-scope-parameters-unit.js`, `tools/add-oop-classes-unit.js`, `tools/add-oop-methods-unit.js`, `tools/add-oop-encapsulation-unit.js`, `tools/add-oop-inheritance-unit.js` and `tools/add-debugging-unit.js` (using `tools/unit-tasks.js`, whose `nameCasting` adds the casting sentence to every task that casts its input), `tools/add-a-level-misconceptions.js` and `tools/add-a-level-templates.js`.

**A-level: Data structures** is the second subsection of the A-level group (`data-structures`), after Debugging: Records and tuples (`tup-L…`/`tup-P…`), Stacks and queues (`sq-…`), Linked lists (`ll-…`), Hash tables (`hash-…`), then 3D arrays (`a3d-…`). Each has 26 practice tasks on the A-level ladder (3 at levels 1–5 and 7, 2 at levels 6 and 8–10) and 8 placement tasks (2 at each of levels 2, 5, 7 and 9) with no buggy variants, and an explainer on every task, as in Programming techniques.

- **Coverage maps:** `COVERAGE` in each unit's script, as above (5 or 6 angles each).
- **Lists, tuples and classes only:** no dictionaries, `collections`, `deque` or other imports. A stack is a list whose top is its end (`append`, `pop()`, `stack[-1]`); a queue joins with `append` and leaves with `pop(0)`; the array versions use a fixed list with `top`, or `front` and `rear` that wrap round with `% size`. A linked list uses one `Node` class (`data`, and `next`, which starts as `None`). A hash table is a list of `size` slots, hashed with `key % size`, with linear probing `(index + 1) % size`; a word's hash adds its letters' `ord()` codes.
- **Trace tables:** a node's data is a column of its own (`cur.data`), as every object's attributes are (`harness.py`), and each item of a list of numbers or text has its own column (`queue[0]`). A tuple, a `None` next, and a list of lists aren't shown, so records and 3D arrays are traced through the variables they are unpacked or looped into, and the hash table trace tasks mark an empty slot with 0.
- **No buggy variant runs for ever:** a node joined to itself would make a loop that never ends, so the lost-reference variants cut the list short instead (a `next` left as `None`, or `head` walked along the list).
- **Misconceptions:** fifteen new ids, three for each unit, each with buggy variants on 3 or more of that unit's bank tasks (see [Misconceptions](#misconceptions)). Each explanation says what went wrong, why, and what to write instead (short code, never a whole line of a task's solution).
- **"Show me how":** one worked example for each task type in each unit, in contexts of their own (novels, plates, print jobs, lockers, rivers).
- **Templates:** every practice task has a derived template. A hash table's size and the slots its keys hash to belong together, and some hints name a collision ("8 and 13 both hash to 3"), so the Hash tables tasks keep their sizes fixed and change their keys only as whole sets that keep the same collisions, or as the keys typed in (`fixed`, `noNumbers`, `swaps` and `testSets` in `tools/derive-templates.js`). Each new pair of units taught one after the other (Debugging + Records and tuples, then each data structures pair) has 3 combined templates, and each unit a write-from-scratch template (`tools/add-a-level-data-structures-templates.js`). The combined Linked lists + Hash tables templates show chaining (a linked list in each slot).
- **Tools:** `tools/add-records-tuples-unit.js`, `tools/add-stacks-queues-unit.js`, `tools/add-linked-lists-unit.js`, `tools/add-hash-tables-unit.js` and `tools/add-arrays-3d-unit.js` (using `tools/unit-tasks.js`), `tools/add-a-level-data-structures-misconceptions.js` and `tools/add-a-level-data-structures-templates.js`.

### Trace tables and pick the missing line

Two task types were added for these units. Any unit can use them.

- **Trace table** (`trace`). The student reads a program (with line numbers) and fills in a table in the exam layout: a Line column, a column for each variable (a list gets a column for each position, such as `items[0]`), and an Output column. A row is a line that ran and changed a value or printed something.
  - The table is made by running the program with `harness.trace_code`, which records each variable after every line of the main program. `Checker.traceTable` turns the steps into the table, with the task's `trace` spec: `columns` (which variables), `lineColumn` (`given`, `ask` or `none`), `blanks` (only these cells are asked), `givenRows` and `givenColumns`.
  - **Marking:** cell by cell. A value written again where it didn't change counts as empty, so both ways of filling in a table are right. Spaces and one pair of quotes round text are ignored, and `true`/`false` may be any case. `""` is empty text.
  - **Feedback:** wrong cells are marked in the table, except in placement, where only the count is given. A wrong table is `WRONG_OUTPUT`, with its first wrong row as the evidence (`failed_test_number` is that row). A buggy variant's own table rows are stored as `rows` by `tools/build-variants.js`, and the student's first wrong row is compared with the same row, so misconceptions are matched as for other tasks (`recheck.py` too).
  - There is no Run button, and no Expected output box: both would give the answer away.
- **Pick the missing line** (`partial-parsons`). One line of the program is missing (`____` in the starter). The student picks the line from 3 or 4 options, then checks the program against its tests as usual. The options are listed right one first in the unit script, then shuffled the same way each time. Every wrong option must fail a test without a syntax error, and an option can have a misconception (`optionMisconceptions`).
- Both are named in the teacher view, the export (`task_type`) and the Task browser, which shows the whole trace table behind the model solution.

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
- The tool that made this change is `tools/archive/replace-sep-end.js`.

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

- **The student sees a friendly message for each category**, for example "Python couldn't find a name it expected ('scroe') on line 2. Check your spelling, and that you created it before using it." Every category message ends with one **"What to try"** line (`Checker.failureParts`). The existing plain-English error explanations are still shown underneath. A raw traceback is never shown (a failed test's output ends with the one error line only).
- **A matched misconception comes first.** If the attempt matches a misconception, its `explanation` is the main message, above the category message.
- **Every failed test, from the first check,** the example or a hidden one, shows the input used, the expected output and the student's output, each on its own labelled line ("Input", "Expected", "Your output"), with "(no output)" when nothing was printed (`TaskView.testResultsHtml`). This is the same in practice, placements, endless mode and assignments, and for every task type that is run (write, fill in the blanks, Parsons). If the program stopped with an error, "Your output" shows what it printed and then the error line (for example "ZeroDivisionError: division by zero (line 3)", or "Stopped: it ran for too long."), with the plain-English explanation under it. A test that never ran (an earlier one was stopped) says so. The details come from the check's own run; the code isn't run again. A program using `random` is seeded from each test's own inputs (harness.py), so the input shown is exactly what that run was given.
- **A passed test** shows only "Hidden test 2 passed" (or "Example test passed"), so the full set of tests stays hidden. The category message itself still says nothing about a hidden test ("…didn't print the right thing for one of the hidden tests"); the details are in the list under it. A syntax error is explained once, with no test list (no test ran). The recursion check and the Parsons "line not needed" check fail with every test passed, so they show their own message and no failed tests. The attempt log still records the failing test's details for the teacher.
- **Empty answers count.** Checking an empty answer is now a failed `NO_ANSWER` attempt instead of being blocked. A fill task with *some* blanks empty is still blocked with "Fill in every blank".
- **What's stored.** With each failed attempt the app stores the category and details, the student's code, the output of the failing test (code and output cut to 2000 characters), that test's inputs and expected output, and any misconception matches.
- **`OTHER_ERROR`** was added to the 8 categories in the brief, for runtime errors that aren't `NAME`, `TYPE` or `TIMEOUT`.

### Misconceptions

`misconceptions.json` holds a fixed list of 79 misconception ids, each with a plain-English name, a short description (for teachers) and an `explanation` for students: 2 or 3 sentences saying what the mistake is and what to try next, without giving the answer.

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
- **Functions, File handling and 2D arrays (new):**
  - `FUNCTION_NOT_CALLED`: defines a function but never calls it (or writes its name without brackets)
  - `ARGUMENT_IN_QUOTES`: passes `"name"` instead of the variable `name`
  - `RETURN_MISSING_NONE`: forgets `return`, so the call gives back `None`
  - `PRINT_INSTEAD_OF_RETURN`: prints the answer inside the function instead of returning it
  - `RESULT_NOT_STORED`: calls a function that returns a value but doesn't store the result
  - `WRITE_MODE_OVERWRITES`: uses mode `"w"` to add to a file, which empties it
  - `NEWLINE_NOT_WRITTEN`: expects `write()` to start a new line
  - `LINE_NEWLINE_KEPT`: uses a line read from a file without `strip()`, so its `\n` is still on the end
  - `ROW_COL_SWAPPED`: uses `grid[col][row]`, or reads down the columns instead of along the rows
  - `ROWS_COLS_LEN_MIXED`: mixes up `len(grid)` (rows) and `len(grid[0])` (columns)
- **Validation and Authentication (new):**
  - `AND_OR_CONFUSED`: joins two parts of a check with `and` where `or` is needed, or the reverse
  - `REASK_CONDITION_UNCHANGED`: asks again inside a `while` loop but stores the answer in another variable, so the condition never changes
  - `ISDIGIT_NEGATIVE`: expects `.isdigit()` to accept negative numbers or decimals
  - `IN_NOT_EQUALS`: compares with a list of allowed values using `==` instead of `in`
  - `EMPTY_AFTER_CAST`: casts with `int()` before checking for an empty answer
  - `USERNAME_CASE_MISMATCH`: compares usernames without allowing for capital letters
  - `ATTEMPTS_NOT_COUNTED`: never increases the failed-attempt counter (for example writes `failed + 1` on its own)
- **Searching and sorting (new):** `LINEAR_NOT_FOUND_MISSING`, `LINEAR_STOPS_EARLY`, `BINARY_UNSORTED`, `BINARY_BOUNDS_NOT_UPDATED`, `BINARY_MID_FLOAT`, `BUBBLE_RANGE_OFF_BY_ONE`, `BUBBLE_SWAP_NO_TEMP`, `INSERTION_OVERWRITES`, `INSERTION_KEY_NOT_KEPT`, `MERGE_ITEMS_LOST`, `MERGE_NO_COMPARE`
- **A-level programming techniques (new):**
  - `RECURSION_NO_BASE_CASE`: a recursive function with no base case, or one its calls never reach (it ends in a `RecursionError`)
  - `GLOBAL_KEYWORD_MISSING`: changes a global variable inside a function without `global`
  - `LOCAL_THOUGHT_CHANGES_OUTSIDE`: expects a parameter or local variable given a new value inside a function to change the one outside
  - `LIST_COPY_ASSUMED`: expects a list or object passed in, or assigned with `b = a`, to be a copy
  - `SELF_MISSING`: leaves `self` out of a method, or out of `self.name` inside one
  - `ATTRIBUTE_NOT_STORED`: stores a value in a local variable instead of an attribute (`name = name`)
  - `METHOD_NO_BRACKETS`: writes `obj.method` instead of `obj.method()`
  - `GETTER_BYPASSED`: reads or changes a private attribute directly, skipping the setter's check
  - `SUPER_NOT_CALLED`: a subclass's `__init__` doesn't call `super().__init__(...)`
  - `OVERRIDE_WRONG_VERSION`: expects the parent's version of an overridden method to run (or names the override differently)
  - `FIRST_ERROR_IGNORED`: looks at a later line instead of the first error
  - `WRONG_LINE_FIXED`: changes the line where a wrong value shows, not the line that causes it
- **A-level data structures (new):**
  - `TUPLE_CHANGED_IN_PLACE`: assigns to one field of a tuple (a `TypeError`) instead of making a new tuple
  - `RECORD_FIELD_WRONG_INDEX`: reads the wrong field of a record (often counting from 1)
  - `TUPLE_UNPACK_ORDER`: unpacks a tuple, or builds one, with its fields in the wrong order
  - `STACK_POP_FROM_FRONT`: treats index 0 as a stack's top (`pop(0)`, `stack[0]`, `insert(0, ...)`)
  - `QUEUE_REMOVE_FROM_BACK`: takes items off the back of a queue (`pop()`, or `queue[rear - 1]`)
  - `POP_EMPTY_NOT_CHECKED`: pops a stack or queue without checking it has items (an `IndexError`)
  - `LINKED_LOST_REFERENCE`: cuts off the rest of a linked list (a new node's `next` not set first, or `head` walked along)
  - `LINKED_STOPS_EARLY`: loops `while cur.next != None`, leaving out the last node
  - `LINKED_HEAD_NOT_UPDATED`: adds or removes the first node without moving `head`
  - `HASH_NO_MOD`: works out an index without `% size` (or probes with `index + 1`)
  - `HASH_COLLISION_OVERWRITES`: stores a key without checking its slot, so a collision loses a key
  - `HASH_SEARCH_STOPS_AT_HOME`: searches only a key's home slot, missing a key moved along by probing
  - `CUBE_INDEX_ORDER`: writes a 3D array's indexes in the wrong order
  - `CUBE_WRONG_LEN`: takes the length of the wrong level (`len(cube)` for the rows or columns)
  - `CUBE_SHARED_ROWS`: builds rows with `*` or appends the same row twice, so they are one shared list

`LOOP_ZERO_RUNS` now also covers a `for` loop over an empty range, such as counting down with a positive step.

- **A task names up to 3 misconception ids in its `tags`.** Ids are the only all-capitals tags. Other tags are lower case, so the old `BIDMAS` tag is now `bidmas`.
- **A task may have `buggy_variants`**: short programs that each show one misconception (`{ "misconception": "GT_VS_GTE", "code": "…", "outputs": [...] }`).
- **How matching works.** When an attempt fails, the student's result on the first failing test is compared with each variant's result on the same test. A variant matches if both printed the same thing (ignoring trailing spaces) and ended the same way: no error, or the same kind of error (for example `TypeError:concat`, or a syntax error from `=` in a condition). Two runs that both went on forever also match, which is how `LOOP_NO_UPDATE` is found. If nothing matches, nothing is recorded: a misconception is never recorded without a match. `NO_ANSWER` attempts are never matched.
- **Variant outputs are worked out in advance.** `node tools/build-variants.js` runs every variant through `harness.py` on each of its task's tests and stores the results in `outputs`. The app and `recheck.py` compare against these stored outputs, so their results are identical. **Run it after adding or changing a variant or a task's tests.** The test script fails if the stored outputs are out of date.
- **Coverage now:** 646 tasks have misconception tags and buggy variants (756 variants in total):
  - **43 of the 232 placement tasks**, all in the first seven units. By rule, the placement tasks of every unit from Strings on have no buggy variants, so the 189 without variants are those 176, plus:
    - 7 Output and sequence tasks and 1 Variables task, whose ideas (`sep=`, `end=`, the order of statements, reassignment) have no id in the list yet
    - `for-P7a` (looping over a string), which has no matching id
    - 4 Data types tasks (`types-P2a`, `types-P2b`, `types-P7b`, `types-P7c`), whose mistakes (`/` giving a float, `*` on a string, a forgotten line) have no id
  - **603 of the 1306 bank tasks**, in every unit except Output and sequence (none): for example 21 in Selection, 29 in Count-controlled loops, 38 in Validation, and 11 to 23 in each searching and sorting and A-level unit.
  - **Rules:** every id has variants on at least 3 bank tasks. Every id used in the loops units has variants on at least 3 bank tasks within those two units.
  - **Template variants:** a variant made from a bank task keeps its buggy variants, and their outputs are worked out when the variant is made (by running them), so mistakes on variants are matched too. The hand-written templates (Endless mode's single-unit and combined templates, write-from-scratch) have none.

All values are named constants at the top of `app.js`:

| Constant | Default | Meaning |
|---|---|---|
| `START_LEVEL` | 1 | Level a unit starts at when there is no placement result (a unit with no placement test, or a reset before placement) |
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
| `MAX_HINTS_PER_TASK` | 3 | Hints available on a task |
| `RUN_TIMEOUT_MS` | 5000 | How long a run may take before it is stopped |
| `PLACEMENT_LEVELS` | 2, 5, 7, 9 | Levels of the placement tasks, in order (a pass moves to the next one; a fail gets a similar task at the same level) |
| `PLACEMENT_TASKS` | 4 | Tasks in every placement test |
| `PLACEMENT_ATTEMPTS` | 2 | Checks allowed on each placement task (2 wrong = failed) |
| `BUTTON_JUMP_LEVELS` | 1 | Levels moved by "This is too easy" / "This is way too hard" |
| `SHOW_HOW_AFTER_FAILS` | 2 | Failed attempts on one task before "Show me how" is offered |
| `MAX_NEW_VARIANT_TRIES` | 40 | Draws to find a template variant that hasn't been passed |

## Expected output and example test

- **Every task except predict** shows a box labelled **Expected output** under its description. It holds the exact output the program should print for the **example test** (the task's first test), with that test's input. It is the same text the checker compares (`Checker.normalise`: trailing spaces and trailing blank lines are ignored). A task that prints nothing says "No output – the program should not print anything."
- The box also says how many **hidden tests** there are. Their inputs and outputs aren't in the box; a hidden test's input, expected output and the student's output are shown only after a check it failed (see [Automatic failure classification](#automatic-failure-classification)). **Run** uses the example test's input.
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
- `tools/archive/print-commas.js`, `tools/archive/print-commas-templates.js` and `tools/archive/casting-words.js` made these changes once. Each one checks that every changed solution still prints its expected output.

## Tutorial (`tour.js`)

A walkthrough over the real screen, one step at a time, on the student pages only (never the teacher view, teacher practice or a frame).
- **New students** (nothing started, nothing remembered in this browser) get the full walkthrough the first time the unit menu opens: signing in (backend mode) or choosing a unit (local mode), the quick check, the unit cards, the task, Run and Check my answer, hints, Show me how, the level buttons, freshness, My progress and Help. Each step rings the control it is about and scrolls to it; a step whose control is on the task page says so, and those steps run again, pointing at the real buttons, the first time the student opens a task.
- **Returning students** get a short reminder above the unit cards only when something is new for them: a new assignment, a unit whose quick check isn't done, a unit whose freshness has dropped to a new band, or a new unit. Each reminder has a link to the thing and Dismiss, and is shown once (at most 3 at a time; the rest on the next visit). A student who had already started a unit before this was added starts with everything counted as seen, so they get no flood of reminders and no walkthrough.
- **Help** (home page, and My progress, which links to `app.html#help`) opens the walkthrough from step 1 again.
- The card sits at the bottom of the screen (16px from each side, at most 28rem wide), never as a backdrop. Skip closes it at any step, Escape closes it, and the arrow keys move between steps. Closing removes everything it added and gives focus back.
- What has been seen is kept in this browser only, per student, under `pythonPractice.tutorial.<student id>`, with every storage error caught. If storage is blocked nothing opens by itself (it couldn't be remembered); Help still works.

## Teacher view

**Teachers start from the home page.** Its **New teacher** and **Returning teacher** buttons open `teacher.html#signup` and `teacher.html#signin`. The student pages (`app.html`, `practice.html`, `progress.html`, `endless.html`) have no "Teacher view" link, so a signed-in student is never pointed at it. A feature test checks that no student page, and no script one loads, links to it.

- **Backend mode:** `teacher.html` shows only the teacher sign-in form until a confirmed teacher signs in. A student who opens it sees that form and nothing else: no classes, no class data, and none of the student data cached in their browser. Their code and PIN don't work there, because students aren't Supabase users. A signed-in teacher sees only their own classes (row-level security). Teacher sign-up is still open, though: see Known limitations.
- **Local mode:** `teacher.html` has no sign-in. **Anyone who opens it can see all the data saved in that browser**: every student's name, levels, attempts and code. Removing the link only hides the page. This is a limit of local mode, not a security control.

`teacher.html` starts with the note "Data is stored in this browser only. Results from other devices won't appear here." (local mode). It warns when the browser's storage is nearly full (about 4 of the 5 MB a site may use). A **side menu** opens its pages: Classes, Students, Assignments, Reports, Misconceptions, Task browser and Settings. Each page has its own address (`#classes`, `#students`, `#misconceptions`, …), and the old addresses still work (`#overview` opens Students; `#log` opens Reports; `#workshop` opens Misconceptions). In backend mode the class being looked at is chosen at the top, with who is signed in and Sign out.

**Collapsible sections.** Each section heading (Name and stage, Student logins, Delete this class, Secured score per unit, Exports, Compare classes, and on the Misconceptions page the misconception table, the unmatched attempts and the not-matched-yet list) is a button that collapses or expands that section, like the unit groups in the student view (`collapse.js`). Every section starts expanded, except the three on the Misconceptions page, which start collapsed until they are opened (then remembered as `open:<id>`). The collapsed ones are remembered in this browser under `pythonPractice.teacherCollapsedSections`, separate from the student view's key. If storage is blocked, the sections still open and close but start expanded each time.

**Classes (`#classes`, backend mode)**

- **Create a class** with a name and a **stage**: KS3, GCSE or A-level (`classes.stage`, migration `0013_class_stage.sql`; classes made before it are GCSE).
- The chosen class's **class code** (with Copy code) and end date; **Rename** and **Save stage**. The stage decides which units the Students page shows and which sections of the students' unit menu open by default (see [Class stage](#class-stage)).
- **Student logins**: Show codes (logged), Copy codes, Reset PIN, Delete, Refresh, and **Import full export** (see Importing a full export).
- **Delete this class**, and what is kept and for how long.

**Students (`#students`, the default)**

- The class code card (with Copy code), then a **summary strip** of nine tiles that count students, each student in exactly one; then the **class average secured score per unit** (of the students who have secured it). The tiles are a three-by-three grid (one row of nine on a wide screen). Each tile's label is a chip in a colour the unit cells use, and says what it counts (also shown when you point at the tile):
  - a student with a secured unit, by the band of the average of their secured units (an average between two bands takes the one below, so 95% is Fresh and 85% Fading): gold **Secured (100%)**, light blue **Fresh (90%)** (90% to 99%), blue **Fading (80%)** (80% to 89%), indigo **Revisit soon (under 80%)** (any secured average under 80%, such as 75%; a secured average is never under 50%);
  - a student with placed units but nothing secured yet, by their average level: red **Levels 1 to 3: still learning**, amber **Levels 4 to 6: still learning**, green **Levels 7 to 9: still learning**, light green **Level 10: not secured yet**;
  - grey **Not placed yet**: no placed unit.

  A unit that isn't secured never counts as 0% or red for that reason. (The class scores export keeps its RAG column: green, amber or red by the same averages.)
- **The tables**: two rows per student, one column per unit of the class's stage (local mode: GCSE), plus the student's average (of their secured units; with none secured, their average level in its colour). The **Freshness** row shows the [secured score](#secured-score) and its label in its colour (or Not secured yet, or grey Not placed yet). The **Level** row shows the level, the placement result, **★ Complete** once a level 10 task is passed, and the flags. The student's name is one cell across both rows.
  - **One table per group of units** (the curriculum's groups, with A-level split into its two parts; a group of more than 5 units is split evenly, e.g. 4 and 3 "(continued)"). Each table is the full width: Name, Shows and Average have fixed widths and the unit columns share the rest, so long unit names wrap instead of making the table scroll sideways. Where the tables are narrower than 850px (a phone or tablet), each student's rows become tiles, each named by its unit. Sorting by any table's column heading sorts every table. Built in `teacher-data.js` (`overviewTablesHtml`).
  - **Not secured yet**: a placed unit that isn't secured shows its level in the level's colour, "Level 8", never 0%: levels 1 to 3 red, 4 to 6 amber, 7 to 9 green, 10 light green. The student's page shows it the same way, with a bar for the level.
  - **Grey, "Not placed yet"**: a unit the student has started but whose placement test isn't done yet (its placement record is still pending or in progress, the same rule as the app's). It has no score or colour, and doesn't count in the student's average, the summary tiles' groups or the class averages. A unit with no placement test (the searching and sorting units), or one started before placement existed, counts as placed.
  - **Flags: the student's own button presses**, each with a tooltip and the time of the newest press under it (from the unit's `buttonsUsed` and the button log, which the app already records; no new record). Each button moves the student one level (`BUTTON_JUMP_LEVELS`). They replace the earlier "Too easy used" and "Too hard used" badges, which showed the same presses.
    - **Too easy** (green): the student pressed "This is too easy" in this unit. "It moved them up one level. Check that their level is right."
    - **Way too hard** (red): the student pressed "This is way too hard" in this unit. "It moved them down one level. Check that their level is right."
- Select a column heading to sort (unit columns by secured score); select it again to reverse. Filter by name. Select a name to open that student.
- The old "2+ fails in a row" panel is gone. How many fails in a row a student has is still on their own page and in the levels export, but it is never a flag or a colour.

**One student (`#student=<id>`)**: a back link, then **Reset placement** (for any unit, as before), and in backend mode **Reset PIN**, **Rename** (teacher-api `rename_student`, with the same nickname rules and word filter as joining) and **Remove student**. Then the secured score per unit as a bar with its label ("Not placed yet" until its placement is done), the button flags with the time of the newest press, the number of fails in a row (as text), and the newest 30 attempts: the task (a link to it in the Task browser), the result, the time, the hints used, which test failed, and the misconception matched. The full log of every attempt is only in the export.

**Assignments (`#assignments`, backend mode)**: see [Class assignments](#class-assignments-backend-mode). The form also has a builder, **Tasks from one unit, spread across the levels**: choose a unit, how many tasks (1 to 10, 5 at first) and a level range (from 1 to 10 at first), and **Build the list** fills in practice tasks from that unit only (never placement tasks, never one twice), spread evenly from the lowest to the highest level chosen (`teacher-data.js` `spreadLevels`: 5 across 1 to 10 gives levels 1, 3, 5, 7 and 10). A level with no task left uses the nearest level that has one, noted next to the task. It replaces the list. Each task then has **Change** (another practice task of the same unit and level that isn't in the list, or a note that there is none) and **Remove**, and **Add a task from the unit** adds one more, up to 10. The task ids box still works as before (type or paste ids, and the Task browser's "Add to the assignment"). Each assignment lists its tasks.

**Reports (`#reports`)**

- **Exports**, all free:
  - **Class scores (CSV)**: `python-practice-class-scores-<date>.csv`, each student's average and each stage unit's secured score, label and level.
  - **Full attempt log (CSV)**: `python-practice-full-data-<date>.csv` with every attempt, skip, use of "Show me how", level change, button use and placement result (and reset) for the whole class, one row each, with `data-dictionary.csv`. Two columns were added at the end: `hint_type` and `variant_fingerprint`. Then `assignment_id` was added after them, with the new `phase` value `assignment` (backend mode). Every earlier column and value is unchanged. The `record_type` column says which. The browser may ask before allowing two downloads.
  - **Data dictionary**: `data-dictionary.csv` on its own. It explains every column and every coded value (record types, failure categories, error kinds, level-change reasons and misconception ids) in plain English, so an AI tool can analyse the data without other context.
  - **Levels table**, **Detail log** and **Workshop tables (CSV)**: the three exports the old pages had, with the same columns (the levels table uses the Students page's name filter; the detail log has every row, including code and output).
  - **All level changes**: every level change, newest first, with the reason, under a fold.
- **Compare classes**: the teacher's own classes only, each one's average secured score per unit, side by side (local mode: this browser).
- **Workshop tables** and the misconceptions workshop itself are on the **Misconceptions** page (a line here links to it).

### Misconceptions page

`#misconceptions` (the old `#workshop` opens it), between Reports and Task browser in the side menu. Where the class goes wrong, to help plan small-group workshops.
- **Unit picker**: the units of the class's stage (`curriculum.js` `stageUnits`), the first one by default, then **All units**.
- **Most-failed tasks** for that unit, this class's students only: up to 10 tasks, each with its failed attempts out of all attempts, the failure rate, the most common failure type and the top misconception (or "none matched"). Every task name opens that task in the Task browser, ready to try. A unit with no failed attempts says so.
- Then three sections, collapsed until opened (remembered in this browser): the **Misconception table** (for each misconception matched, in every unit: the attempts matched, students affected, the tasks it shows up in, the failure rate on those tasks and the students); **Failed attempts with no match, by task**, with **View** (the code and output side by side); and **Not matched yet**, the misconceptions no student in the class has shown yet.

**Task browser (`#tasks`, or `#tasks=<task id>` to open a task)**

- A search box finds a task by its id (`var-L9d`, in any case; an old id from `former_ids`; a template variant id like `d-var-L9d#123`; or an id with a number on the end like `var-l9d-2`) or by words in its title.
- The task opens in **the student's own practice view** (`practice.html?preview=<task id>`, in a frame): the code editor, Run, the same output and feedback. **Hint (free)** and **Check answer** can be used as often as the teacher likes; **Show solution** opens the model solution below. **Teacher practice is never recorded**: `app.js` `stopRecording` replaces every Store function that writes before the page reads anything, so no attempt, pass, progress, level change, button use or event is saved in the browser or sent to the server, and the page only runs inside `teacher.html`. A feature test calls every Store function after `stopRecording` and checks nothing was saved.
- Below it: the question as students see it, the starter code, the **Expected output** box, every test (teacher only), the hints, the explainer and the **model solution** behind a Show / Hide button. In backend mode, while an assignment form is open, **Add to the assignment** adds the task to it.
- The model solution is in `task-browser.js`, which only `teacher.html` loads, so no student page ever shows one.

**Settings (`#settings`, backend mode)**: **Change password**: the current password (checked by signing in with it again), then the new one twice. Sign-up asks for the password twice as well.

### Secured score

`secured.js` works out a unit's secured score from the student's attempts. The teacher view (`teacher-data.js`) and the student view (`home.js`) both use it, so they always agree.

- A **level 10 pass** is a pass in endless mode, or a pass of a level 10 task on the ladder, with **no hints** (the attempt's hints count is there and is 0) and **not after "Show me how"** on that task (the attempt then has `hint_type` `show-me-how`; attempts recorded before this have none and count as before). Placement and assignment passes don't count.
- **Two** level 10 passes give **100%** (Secured). Before that the unit isn't secured: once its placement is done, the teacher's table shows its level in the level's colour, "Not secured yet"; before its placement it is grey, "Not placed yet".
- The score is counted in **full days since the last level 10 pass**, and drops in **weekly steps of 10 points**, never below the **floor**. One more level 10 pass brings it back to 100%.

  | Days since the last level 10 pass | Score (first time, floor 50%) |
  |---|---|
  | 0 to 6 | 100% |
  | 7 to 13 | 90% |
  | 14 to 20 | 80% |
  | 21 to 27 | 70% |
  | 28 to 34 | 60% |
  | 35 or more | 50% (the floor) |

  With a higher floor (after coming back to 100%) the score stops at that floor instead.
- The floor is 50% the first time the unit reaches 100%, and 10 points higher each time it comes back to 100% (60%, 70%, 80%, 90%), up to **100%** after five returns: from then on the unit stays at 100%. A pass while the score is still 100% keeps it fresh but doesn't raise the floor. Every score is a multiple of 10, so no unit ever shows 95%.
- **"Unit secured at 100%" pop-up** (practice page): after a pass in practice or endless mode that takes the unit to 100% (the second level 10 pass, or a return to 100%), worked out by `secured.js` from the attempts before and after the pass (`reachedFullSecure` in `app.js`). It says "You've passed this unit's level 10 challenge with no hints. You can move on, or keep practising in endless mode." with **Back to units** (the home page) and **Stay in endless mode** (closes it; Esc does the same). It's a dialog (`role="dialog"`, `aria-modal`, labelled by its heading, which gets focus; neither button is the default), focus stays inside while it's open, and goes back to the task when it closes. It opens after the pass is saved and is never saved itself, so a reload doesn't show it again. Never in placement, assignments or teacher practice, and not for a pass while the unit is already at 100%.
- Two colour ramps (`secured.js`, used by both views), each colour always shown with its label:
  - **Freshness ramp**, a secured unit: gold, glowing, **100% Secured**; light blue **90% Fresh**; blue **80% Fading**; indigo **50–70% Revisit soon**. A secured unit never falls below 50%, so this ramp has no red. An average of several units (teacher view) can fall between these and takes the band below it (for example 95% is Fresh, 85% Fading).
  - **Level ramp**, a placed unit that isn't secured yet ("Level N"): red **levels 1–3**, amber **4–6**, green **7–9**, light green **10**.
  - Before its placement is done a unit is grey, **Not placed yet**, in the teacher view, and a dashed blue outline, **Placement to do**, on the student's unit card.
- In the student view a secured unit glows gold at 100% and shows its colour and label as the score falls; a placed unit that isn't secured shows its level in its colour. A unit with a level 10 pass that isn't secured yet keeps its "★ Level 10 passed" note. Both pages have a colour key.

### Class stage

A class's stage (`classes.stage`: `ks3`, `gcse` or `a-level`) decides which units the Students page shows and which sections of its students' unit menu open by default: KS3 opens Programming fundamentals and Advanced programming; GCSE adds Validation, and Searching and sorting; A-level opens every section. Students can still open any section. The stage reaches the student app through student-api `get_progress` (`student.class_stage`) and is kept with the student's other cached data (`Store.classStage`). The first time a stage is seen on a computer, or when the teacher changes it, the open and closed sections start again from the stage (`Collapse.resetForStage`); after that the student's own opening and closing is kept. Local mode has no class, so every section starts open, as before. A server without migration 0013 sends no stage, and everything works as before (the teacher view shows every class as GCSE).

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

- **Units:** every unit has at least 30 tasks, at least 1 per level (counting only tasks that can be set at that level: units have different numbers at each level) and every task type its ladder uses at least once. Selection keeps at least 100 tasks.
- **Explainer:** every task in the A-level units, and every variant of their templates, has a one-sentence explainer with its placeholders filled in, and a predict task's never contains the answer; a derived template has one exactly when its source task does.
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
- **Units and skills:** the units are listed in the order above, and a skill in two units' lists (`accumulator`) counts for the task's own unit.
- **Each level's task type** comes from the ladder, or from the unit's own `levelTypes` (File handling, the levels with two types in the searching and sorting and A-level units); a unit with `noScratch` has no from-scratch templates and needs none, and a unit with `noPlacement` has no placement tasks.
- **Trace and pick-the-missing-line tasks:** a trace task's stored table is the one tracing its solution gives, and fits the rules (at most 40 rows, cells to fill in); its buggy variants' stored rows are up to date and differ from the real table; a pick-the-missing-line task has one gap, 3 or 4 different options, and every wrong option fails a test.
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
  - **Functions, File handling and 2D arrays:** each unit's tasks per level, placement tasks, ids, skills and level types; hints that name a skill use the skill list's word; no SQL, recursion, classes, list comprehensions or imports; no `return` in Functions (no return value); File handling has only puzzle tasks and templates, writes its own file before reading it, and has no from-scratch templates; each run starts in an empty folder; the ten new misconceptions; the new error advice.
  - **Strings, Random and Lists:** the unit order; each unit's tasks per level, placement tasks, ids and skills; only the Python each unit teaches; no validation or authentication tasks; hints that name a skill use the skill list's word; the six new misconceptions; Random predict answers don't depend on the numbers; `harness.py` and `pyRandom` give the same numbers; the new error advice.
  - **Printing rule:** no task joins values with `+` and `str()` inside `print()`; every task that builds and stores text with `+` says why in a hint; every task that casts `input()` says "casting"; the two new predict tasks exist.
  - **Expected output:** every non-predict task's box shows the example test's output exactly as the checker compares it (or the "No output" line), never a hidden test's input or output, and says how many tests are hidden. A failed hidden test's message says nothing about it; the results list under the message shows each failed test's input, expected output and the student's output, and nothing about a passed test.
  - **Task browser:** search by id, title, old id and variant id; every test's expected output is the checker's and every model solution passes against it; it shows the same box as the student's page; the model solution starts hidden; no student page loads the browser.
  - **No teacher link:** no student page (`app.html`, `practice.html`, `progress.html`, `endless.html`), and no script one loads, links to `teacher.html`.
  - **Home page and unit groups:** the home page's four buttons and their targets, its logo, tagline and Dark default (not used by the other pages); `#join` and `#signin` open the right form; the header wordmark and the tab icon on every page; back links go to `app.html`; the five groups hold every unit once, in order, with Validation, Authentication and Trace tables in the Validation group, the five searching and sorting units in theirs, and the seven A-level programming techniques units and the five data structures units in the A-level group's two subsections; the collapse buttons, remembered with storage errors caught; the teacher view's eight collapsible sections, with their own key, run through collapse.js (start expanded, collapse, stay collapsed after a reload, still work with storage blocked); no "Haven't started a unit" box.
  - **Trace tables and searching and sorting:** Trace tables' 3 trace tasks per level (1–2 short programs, 3–4 blanks, 5–6 input, 7–8 selection with the Line column asked, 9 a loop, 10 about 15 rows) and its placement tasks; each searching and sorting unit's 41 tasks and task types per level, no placement, lists of at least 5 items from level 7, a "Show me how" for every task type; no recursion, and Merge sort's note; derived, from-scratch and combined templates; the eleven new misconceptions; marking a trace table (an unchanged value written again, quotes), its failure category and evidence row, and matching a misconception on a row; the builder's checks for both new types, each with tasks it must refuse; `harness.trace_code`; migration 0010, `rows.ts` and the data dictionary.
  - **Validation and Authentication:** the ladder (predict, fill, Parsons, write); 5 tasks per level in Validation (one per kind of check, 10 of each) and 3 in Authentication (the same step at each level); 2 placement tasks at levels 2, 5, 7 and 9, with no buggy variants; 1–2 tests per task, with two different results where there are two; nothing out of scope (`try`/`except`, `.isalpha()`, `.startswith()`, regular expressions, hashing, files, dictionaries); a function returning `True` or `False` at level 10; the seven new misconceptions (3-sentence explanations, 3 or more tasks each) and the reused `EQUALS_VS_DOUBLE_EQUALS`, `BOUNDARY_LT_VS_LTE` and `GT_VS_GTE` (no duplicate ids); "Show me how" for every skill, with the re-ask loop at level 8 and the validation function at level 10; `val-L1t` has no cast; derived and from-scratch templates.
  - **A-level programming techniques:** the unit order and the A-level group with its Programming techniques subsection (drawn by `home.js`); the ladder, placement tasks `<prefix>-P2a/b` … `P9a/b` with no buggy variants, and Debugging's `noScratch`; each unit's coverage map (every angle has tasks that exist) and practice tasks at every level; an explainer on every task, inherited by every derived template; a "Show me how" for every task type; 3 combined templates per new pair and a from-scratch template for each unit but Debugging; the twelve new misconceptions (3-sentence explanations, variants on 3+ tasks), `RETURN_MISSING_NONE` reused, and `RecursionError` variants; object attributes in a trace table; migration 0011, `rows.ts` and the data dictionary.
  - **Explainer:** hidden before any check and after one wrong check, shown straight after the second wrong check or a pass, never on a task without one (`App.explainerShown`); the box starts hidden above the buttons, before Skip; a variant gets it with its own values; no database column, server check or attempt field names it.
  - **Assignments:** the assignment id goes into the attempt record, the row and the export (as the last column, with every earlier column unchanged) and the data dictionary; the per-task summary (tried, passed, struggled most); importing never rebuilds levels or passes from assignment work; assignment work is kept apart from the saved progress.
  - **`recheck.py`:** an unchanged export gives the same matches as the app (including an attempt on a template variant, made again from its template and seed); a new buggy variant changes the matches only for the attempts it applies to; an export that names a moved task by its old id keeps its matches.
- **Simulation:** `tests/simulate.js` runs nine made-up students through the rules. It checks the fast move up, the normal move down and the recovery drop with its ceiling, and that a student who uses "Show me how" twice doesn't change level because of it (compared with the same student without it). Run it on its own to see each student's level task by task:

  ```
  node tests/simulate.js
  ```

**Backend mode tests:**

- `node tests/backend-client.js`: `backend.js` against a fake server in memory (outbox, offline, signed out, shared computers, deleting). No network needed.
- The feature tests also check export parity: the same class exported in backend mode gives the same CSV, overview, quick look and detail log, and an imported export gives the same rows again.
- `node tests/sql/run.js`: row-level security and the server functions, in the local database (`npx supabase start`). Each file runs in a transaction that is rolled back. `assignments.sql` checks the assignments table: only the class's teacher can read or change its assignments, the table's checks, and that an attempt can only name an assignment of the student's own class. `data-types-unit.sql`, `strings-random-lists-units.sql`, `functions-file-arrays-units.sql`, `validation-authentication-units.sql`, `searching-sorting-trace-units.sql`, `a-level-programming-techniques-units.sql` and `a-level-data-structures-units.sql` check that every table accepts the units added by 0006, 0007, 0008, 0009, 0010, 0011 and 0012 and still refuses unknown ones; `searching-sorting-trace-units.sql` also checks that attempts accept the task types `trace` and `partial-parsons` and refuse unknown types.
- `$env:TEST_BACKEND = "1"; node tests/backend/run.js`: the Edge Functions and the API on the local stack (also `npx supabase functions serve`). Set `FUNCTIONS_ENV_FILE` to the secrets file to test an expired token too. With `$env:TEST_BACKEND_TARGET = "test-project"` it runs against the test project named in `tests/backend/config.local.json` (git-ignored), and refuses any other project. It makes its own teachers and deletes them afterwards.

**In-browser check (optional):** serve the folder and open `http://localhost:8000/tests/browser-check.html`. It runs every bank solution, and one variant of every template (derived ones made in Pyodide, as the app makes them), through the real Pyodide worker. It also checks that an infinite loop is stopped by the timeout and by the line limit. Making the variants takes a few minutes.

## Files

The `tools/add-<unit>-unit.js` scripts are records of how each unit was built, not a way to rebuild: each one refuses to add a unit that is already in `tasks.json`, and later changes (such as the archived rewrites in `tools/archive/`) were made to `tasks.json` after the older ones ran.

| File | Purpose |
|---|---|
| `index.html` | Home page: logo, tagline, and the student and teacher buttons (opens in the Dark theme) |
| `app.html`, `home.js` | Student view: joining or signing in (or the name screen), the grouped unit menu, links to My progress and Endless mode |
| `assets/logo/` | The logos (main, wordmark and icon, each in a light and a dark version) |
| `practice.html`, `app.js` | Practice session for one unit, or Endless mode: task types, hints, the editor, the adaptive rules and their constants |
| `progress.html`, `progress.js` | Progress summary and skill drill-down |
| `endless.html`, `endless.js` | Endless mode set-up: choosing units |
| `teacher.html`, `teacher.js` | Teacher view: a side menu of Classes, Students, one student, Assignments, Reports (exports, compare classes), Misconceptions (the workshop), Task browser (with teacher practice) and Settings |
| `secured.js` | The secured score of a unit and its colour bands (shared by the teacher view and the student view) |
| `tour.js` | The student app's tutorial: the walkthrough, the reminders and Help (see [Tutorial](#tutorial-tourjs)) |
| `collapse.js` | Collapsible sections, shared by the student view's unit groups and the teacher view's sections (each remembered under its own localStorage key) |
| `task-view.js` | The Expected output box and example test (practice page and Task browser), and the task search |
| `task-browser.js` | The teacher's Task browser, with the model solutions (loaded by `teacher.html` only) |
| `tools/add-data-types-unit.js`, `tools/add-data-types-templates.js` | One-off: the Data types and casting unit's tasks and templates (each checks its results) |
| `tools/add-strings-unit.js`, `tools/add-random-unit.js`, `tools/add-lists-unit.js`, `tools/unit-tasks.js` | One-off: the Strings, Random and Lists units' tasks, built and checked by the shared `unit-tasks.js` |
| `tools/add-strings-templates.js`, `tools/add-random-templates.js`, `tools/add-lists-templates.js`, `tools/hand-templates.js` | One-off: those units' combined and from-scratch templates, checked by the shared `hand-templates.js` |
| `tools/add-functions-basic-unit.js`, `tools/add-functions-return-unit.js`, `tools/add-file-handling-unit.js`, `tools/add-arrays-2d-unit.js` | One-off: the two functions units', File handling's and 2D arrays' tasks (built with `unit-tasks.js`) |
| `tools/add-functions-templates.js`, `tools/add-file-handling-templates.js`, `tools/add-arrays-2d-templates.js` | One-off: those units' combined and from-scratch templates |
| `tools/add-validation-unit.js`, `tools/add-authentication-unit.js` | One-off: the Validation and Authentication units' tasks (built with `unit-tasks.js`) |
| `tools/add-validation-templates.js`, `tools/add-authentication-templates.js` | One-off: those units' combined and from-scratch templates |
| `tools/add-trace-tables-unit.js`, `tools/add-linear-search-unit.js`, `tools/add-binary-search-unit.js`, `tools/add-bubble-sort-unit.js`, `tools/add-insertion-sort-unit.js`, `tools/add-merge-sort-unit.js` | One-off: Trace tables' and the five searching and sorting units' tasks (built with `unit-tasks.js`, which also builds and checks trace and pick-the-missing-line tasks) |
| `tools/add-searching-sorting-templates.js` | One-off: those units' combined and from-scratch templates |
| `tools/add-recursion-unit.js`, `tools/add-scope-parameters-unit.js`, `tools/add-oop-classes-unit.js`, `tools/add-oop-methods-unit.js`, `tools/add-oop-encapsulation-unit.js`, `tools/add-oop-inheritance-unit.js`, `tools/add-debugging-unit.js` | One-off: the seven A-level units' tasks, explainers and coverage maps (built with `unit-tasks.js`) |
| `tools/add-a-level-misconceptions.js`, `tools/add-a-level-templates.js` | One-off: the A-level units' twelve new misconceptions, and their combined and from-scratch templates |
| `tools/add-records-tuples-unit.js`, `tools/add-stacks-queues-unit.js`, `tools/add-linked-lists-unit.js`, `tools/add-hash-tables-unit.js`, `tools/add-arrays-3d-unit.js` | One-off: the five A-level data structures units' tasks, explainers and coverage maps (built with `unit-tasks.js`) |
| `tools/add-a-level-data-structures-misconceptions.js`, `tools/add-a-level-data-structures-templates.js` | One-off: the data structures units' fifteen misconceptions, and their combined and from-scratch templates |
| `tests/sql/a-level-data-structures-units.sql` | SQL test for migration 0012 (the five data structures units in every unit check) |
| `tools/archive/print-commas.js`, `tools/archive/print-commas-templates.js`, `tools/archive/casting-words.js`, `tools/archive/replace-sep-end.js`, `tools/archive/replace-types-round-if.js` | Archived: one-off rewrites that were each run once (the printing rule's commas and casting, `sep=`/`end=`, and the Data types tasks that used `round()` or `if`), kept as a record. Nothing needs them to rebuild anything |
| `teacher-data.js` | Teacher view sums, filters, the secured score table and flags, the student page, the exports and data dictionary (no DOM, so it's tested in Node) |
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
| `harness.py` | Runs a program with test inputs and captures stdout (shared by the worker and the test script), in its own empty folder, with random numbers seeded from the first input; traces a program for trace tables (with a column for each attribute of the program's objects) |
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
- **Backend mode: `config.js` is committed.** It holds only the project URL and the public anon key, which are safe to publish because row-level security protects the data. The service-role key and the three Edge Function secrets are never in the repository (see `docs/SECRETS.md`). `BACKEND_ENABLED` is `true`: the site uses the trial project's backend.
- **⚠ Decide before the trial starts: who can be a teacher.** Teacher sign-up is open: **anyone with a confirmed email address can create a teacher account** and make classes. A teacher only ever sees their own classes, but nothing limits who signs up. This must be decided before the trial starts (for example, allowing only the school's email domain, or turning sign-up off in Supabase once the trial teachers have accounts).
- **Backend mode: an 8-hour student session.** After 8 hours the student signs in again. Work done in between is kept in the outbox and sent after they do.
- **Backend mode: the local stack's CORS headers.** Locally, Supabase's gateway answers with `Access-Control-Allow-Origin: *`; the functions themselves allow only `https://theogoescoding.github.io` and `http://localhost:8000`, and refuse other origins with 403. The exact headers can only be checked on a hosted project.
- **Storage is limited to about 5 MB per site.** Every attempt is stored, with code and output for failed ones (cut to 2000 characters each), up to 3000 attempts per student. On a shared computer used by a whole class this can fill up. The teacher view warns at about 4 MB; export the full data regularly.
- **Very long outputs are cut short in the export.** The app matches misconceptions on the full output, but stores only the first 2000 characters. So `recheck.py` could disagree with the app for an attempt that printed more than that without being stopped (endless loops are matched on how they ended, not their output, so they're not affected).
- **Variant outputs come from local Python, students' from Pyodide.** Matching compares printed output and a short, version-independent error label, not Python's own error text. Even so, a variant whose output differs between Python versions could match slightly differently in the browser.
- **Misconception matching covers bank and placement tasks with buggy variants, and the variants made from them.** The hand-written templates (single-unit, combined, write-from-scratch) are classified but never matched.
- **No misconception ids yet for Output and sequence ideas** such as `sep=`/`end=` or the order of statements, so most of that unit's placement tasks have no variants.
- **Placement uses the highest level passed**, as the brief says, even if an earlier one was failed. For example, failing 2 but passing 5 starts at 5.
- **Internet is needed the first time.** Pyodide comes from cdn.jsdelivr.net. If it can't load, the page says so and code can't be run.
- **Answers are visible to a determined student.** `tasks.json`, including the solutions and the hidden tests, is downloaded to the browser (in backend mode too: answers are still checked in the browser). No student page *shows* a model solution or a hidden test, but the data is there for anyone who opens the browser's developer tools.
- **Assignment work is kept per browser.** Which task is open, the answers so far and the ✓ marks on an assignment are kept in that browser only. The attempts themselves are saved to the server as usual, so the teacher sees everything, but a student who moves to another computer starts the assignment's tasks with empty answers.
- **Assignments need backend mode.** In local mode there are none.
- **Backend mode: deploy before publishing.** Each migration and the updated Edge Functions must be on the server before the website that uses them is published. Until 0008 is deployed (with `_shared/rows.ts` in `student-api`, `teacher-api`, `join-class` and `resume`), the server refuses all work in the two functions units, File handling and 2D arrays.
- **Files exist only while a program runs.** Each run starts in an empty folder, so a File handling program must write its file before reading it. That is how every task is written, but it also means students can't practise reading a file they made in an earlier run or on their own computer.
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
