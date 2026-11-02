# Python Practice (prototype)

A browser-based Python practice app for students aged 11–16, aligned to KS3 and OCR GCSE Computer Science J277 (section 2.2, programming fundamentals). It has six units:

| Unit | Covers | Practice tasks | Placement tasks |
|---|---|---|---|
| Output and sequence | `print`, comments, running a script, order of statements | 50 | 8 |
| Variables and input | assignment, `input()`, `int()` and `str()` conversion | 50 | 8 |
| Maths in Python | `+ - * /`, `//`, `%`, `**`, operator precedence, rounding | 50 | 8 |
| Selection | `if`, `if/else`, `elif`, comparison operators, `and`/`or` | 190 | 8 |
| Condition-controlled loops | `while`: counters, running totals, sentinel values, input validation, menus, endless loops | 40 | 8 |
| Count-controlled loops | `for` and `range()`: steps, the loop variable, counting, nested loops, looping over a string | 40 | 8 |

On top of the task bank, `templates.json` holds 94 task templates with randomised values. They're used in Endless mode and for the "Write from scratch" challenges.

- **Each unit has its own level (1–10) for each student.** Levels are about support, not topic: every unit runs from predicting the output (level 1) up to writing an extended program (level 10).
- **A placement test** finds each student's starting level the first time they open a unit.
- **Every failed attempt is classified automatically** (syntax error, wrong output, …) and matched against known **misconceptions**, so the teacher view can show who needs which workshop.
- **Student code runs in the browser.** It uses [Pyodide](https://pyodide.org) inside a Web Worker. A run is stopped after 5 seconds, so infinite loops can't freeze the page.
- **Nothing leaves the browser.** There is no backend or analytics. Names, progress and attempts are stored in `localStorage`.

## Running it locally

The app must be served over HTTP. Opening `index.html` by double-clicking it won't work, because browsers block `fetch()` and Web Workers on `file://` pages.

From this folder:

```
python -m http.server 8000
```

Then open:

- Student app: http://localhost:8000/
- Test mode (starting-level control): http://localhost:8000/?test=1
- Teacher view: http://localhost:8000/teacher.html (pages: `#overview`, `#log`, `#workshop`)
- A student's progress summary: http://localhost:8000/progress.html
- Endless mode: http://localhost:8000/endless.html

Any static web server works. The first visit downloads Pyodide (about 10 MB) and the CodeMirror editor (about 190 KB) from `cdn.jsdelivr.net`. After that, the browser loads them from its cache.

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
- **Unit menu.** `index.html` shows a card for each unit, in the order of `UNITS` in `curriculum.js` (Selection, then Condition-controlled loops, then Count-controlled loops come last), with its description, number of tasks and the student's level. Units with no tasks in `tasks.json` are greyed out as "Coming soon". Clicking a card opens `practice.html?unit=<id>`.
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

## Glowing completion card

When a student passes a level 10 task in a unit, that unit's card on the landing page gets a glowing gold border and "★ Level 10 passed". This is separate from *completing* the unit (2 strong passes at Level 10, which unlocks Endless mode), though completing also turns the glow on.

- CSS only. The colours are the theme tokens `--glow` and `--glow-outer`, set for each of the Light, Dark and High contrast themes.
- The glow pulses gently. With `prefers-reduced-motion: reduce` it's a static glow with no pulsing.

## Progress summary (`progress.html`)

Linked as **My progress** on the landing page. There is one card per unit showing:

- the current level
- the percentage of the unit's tasks passed (different bank tasks passed at least once)
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
  - **Which task comes next:** a random ticked unit, at the student's level in that unit. Tasks they haven't passed yet come first. When those run out, a new variant is made from that unit's template for the level, and the same variant is never served twice in a row.
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

- **Expected outputs** are worked out from the drawn values, not by running the solution. Helpers `pyround` (Python's `round`), `fl` (how Python prints a float), `idiv` and `mod` keep them matching what Python prints.
- **Same seed, same variant.** The same template and seed always give the same task.
- **What's in the file:**
  - 60 single-unit templates, one per unit per level
  - 16 combined templates. The 4 newest use the loops units: Selection + Condition-controlled loops, Maths + Count-controlled loops, Variables + Count-controlled loops, and both loops units together (check the input with `while`, then read a known number of values with `for`)
  - 18 from-scratch templates, three per unit

Templates are expanded by `templates.js`, which both the browser and the test script use.

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
| Maths in Python | arithmetic, division, integer-division, modulo, power, precedence, rounding |
| Selection | if, if/else, elif, comparison, boundary, and/or, not, input-conversion, modulo-conditions, input-validation, selection-in-functions |
| Condition-controlled loops | while, counter, accumulator, sentinel, validation, menu, and-or, infinite-loop |
| Count-controlled loops | for, range, loop-variable, step, nested-loop, counting, accumulator |

In Selection, `selection-in-functions` tasks are only set from level 5 upwards (`skillMinLevel` in `curriculum.js`).

`accumulator` is in both loops units' lists. A skill that is in more than one list counts for the task's own unit, so a running total in a `while` task counts in Condition-controlled loops and one in a `for` task counts in Count-controlled loops.

**The loops units build on Selection.** Students already know `if`, `elif`, comparisons and `and`/`or`, so in each loops task the only new idea is the loop.

- **Condition-controlled loops** covers counting up and down, running totals, sentinel values ("keep asking until stop or 0"), input validation, `and`/`or` in the condition, repeating menus, selection inside a loop, and finding and fixing a loop that never ends. At level 10 it combines validation, a running total and a sentinel.
- **Count-controlled loops** covers `range(n)`, `range(start, stop)` (the stop isn't included), steps including negative ones, using the loop variable in a calculation, counting with an `if` inside the loop, nested loops, looping over the letters of a string, and asking how many times to repeat. It also includes tasks on choosing between `while` and `for`.
- **Contexts** are UK school ones: bus fares, library fines, game lives, shop totals, password attempts, quiz scores and register counts.

**Moved from Selection.** The 20 Selection tasks whose main idea was a `while` loop (`loops-L1a` … `loops-L10b`) and the placement task `sel-P9b` are now in Condition-controlled loops, renamed `while-L1a` … `while-L10b` and `while-P9a`. Each one keeps its old id in a `former_ids` field. A new Selection placement task, `sel-P9c`, replaces `sel-P9b`. `functions-L10a` stays in Selection, because its main idea is writing a function. Selection still has at least 18 tasks at every level.

### Adaptive rules

A **strong pass** is a pass that used 1 hint or fewer. After each task, the first matching rule applies:

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

- **The student sees a friendly message for each category**, for example "Python couldn't find a name it expected ('scroe') on line 2. Check your spelling, and that you created it before using it." The existing plain-English error explanations are still shown underneath. A raw traceback is never shown.
- **Empty answers count.** Checking an empty answer is now a failed `NO_ANSWER` attempt instead of being blocked. A fill task with *some* blanks empty is still blocked with "Fill in every blank".
- **What's stored.** With each failed attempt the app stores the category and details, the student's code, the output of the failing test (code and output cut to 2000 characters), that test's inputs and expected output, and any misconception matches.
- **`OTHER_ERROR`** was added to the 8 categories in the brief, for runtime errors that aren't `NAME`, `TYPE` or `TIMEOUT`.

### Misconceptions

`misconceptions.json` holds a fixed list of 16 misconception ids, each with a plain-English name and a short description:

- **Selection, maths and variables:** `EQUALS_VS_DOUBLE_EQUALS`, `SEPARATE_IF_VS_ELIF`, `BOUNDARY_LT_VS_LTE`, `GT_VS_GTE`, `MISSING_ELSE`, `INPUT_NOT_INT`, `PRECEDENCE`, `INT_DIV_VS_DIV`, `STRING_PLUS_INT`
- **Loops:** `LOOP_NO_UPDATE`, `LOOP_TEST_ONCE`, `LOOP_ZERO_RUNS`
- **Count-controlled loops (new):**
  - `RANGE_STOP_EXCLUSIVE`: thinks `range(1, 5)` includes 5
  - `RANGE_START_DEFAULT`: thinks `range(5)` starts at 5 (or at 1) rather than 0
  - `LOOP_VAR_ASSIGNED_IN_BODY`: changes the loop variable inside a `for` loop and expects that to change the loop
  - `NESTED_LOOP_WRONG_INNER`: the inner loop runs the wrong number of times, or the outer variable is reset inside it

`LOOP_ZERO_RUNS` now also covers a `for` loop over an empty range, such as counting down with a positive step.

- **A task names up to 3 misconception ids in its `tags`.** Ids are the only all-capitals tags. Other tags are lower case, so the old `BIDMAS` tag is now `bidmas`.
- **A task may have `buggy_variants`**: short programs that each show one misconception (`{ "misconception": "GT_VS_GTE", "code": "…", "outputs": [...] }`).
- **How matching works.** When an attempt fails, the student's result on the first failing test is compared with each variant's result on the same test. A variant matches if both printed the same thing (ignoring trailing spaces) and ended the same way: no error, or the same kind of error (for example `TypeError:concat`, or a syntax error from `=` in a condition). Two runs that both went on forever also match, which is how `LOOP_NO_UPDATE` is found. If nothing matches, nothing is recorded: a misconception is never recorded without a match. `NO_ANSWER` attempts are never matched.
- **Variant outputs are worked out in advance.** `node tools/build-variants.js` runs every variant through `harness.py` on each of its task's tests and stores the results in `outputs`. The app and `recheck.py` compare against these stored outputs, so their results are identical. **Run it after adding or changing a variant or a task's tests.** The test script fails if the stored outputs are out of date.
- **Coverage now:** 128 tasks have misconception tags and buggy variants (177 variants in total):
  - **39 of the 48 placement tasks.** The 9 without variants are:
    - 7 Output and sequence tasks and 1 Variables task, whose ideas (`sep=`, `end=`, the order of statements, reassignment) have no id in the list yet
    - `for-P7a` (looping over a string), which has no matching id
  - **89 bank tasks:** 21 in Selection, 21 in Condition-controlled loops and 29 in Count-controlled loops, plus the earlier units.
  - **Rules:** every id has variants on at least 3 bank tasks. Every id used in the loops units has variants on at least 3 bank tasks within those two units.
  - **Template tasks** (Endless mode, write-from-scratch) have no variants.

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

## Teacher view

`teacher.html` starts with the note "Data is stored in this browser only. Results from other devices won't appear here." It warns when the browser's storage is nearly full (about 4 of the 5 MB a site may use). It has three pages, each with its own link:

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

- One row per attempt (every Check press and every skip) and per button use, newest first. Columns: time, student, unit, task id, level, result, failure category, misconception matches, hints used, button used, level change, and the code and output (with the expected output) under **Show**.
- Filter by student, unit, task, category and misconception. "(failed, no match)" shows failed attempts with no misconception match.
- Only the filtered rows are shown. The export options stay below.

**Workshop (`#workshop`)**

- For each misconception matched: the tasks it shows up in, the number of attempts and students affected, the failure rate on those tasks, and the list of students, to plan a workshop.
- For each task with failed attempts: the number of failed attempts with no misconception match ("unmatched"), the unmatched rate as a percentage of that task's failures, whether the task has buggy variants, and a **View** button. View shows those unmatched attempts with the code and output side by side, which helps when writing new buggy variants.

**Export** (below every page)

- **Export full data** downloads `python-practice-full-data-<date>.csv` with every attempt, skip, level change, button use and placement result (and reset) for the whole class, one row each. The `record_type` column says which. It also downloads `data-dictionary.csv`, which explains every column and every coded value (record types, failure categories, error kinds, level-change reasons and misconception ids) in plain English, so an AI tool can analyse the data without other context. The browser may ask before allowing two downloads.
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
| `former_ids` | optional array | Old ids of a task that was moved to another unit, e.g. `["loops-L5a"]`. They must not be used by any current task. Keep them, so older attempts and exports still find the task |

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
2. Add at least 30 tasks, with at least 3 for each of its 10 levels and every task type used.

Placement tasks are ordinary tasks with the `placement` tag, at level 2, 5, 7 or 9. Their ids use `P` instead of `L`, e.g. `sel-P7a` or `while-P2a`. Keep at least 2 per placement level in each unit.

**After editing, always run `node tools/build-variants.js` (if you touched buggy variants or tests), then the test script.**

## Testing

```
node tests/validate.js
```

This needs Node 18+ and Python 3 on the PATH (set `PYTHON=...` to use a different interpreter). It runs about 11,500 Python programs, which takes a few minutes. As in the app, each program is stopped after 5 seconds (`tools/run-python.js`), so a buggy variant that loops forever without printing anything can't hang the tests. It checks:

- **Units:** every unit has at least 30 tasks, at least 3 per level (counting only tasks that can be set at that level) and every task type at least once. Selection keeps at least 100 tasks.
- **Task fields:** every task has the required fields, a valid unit, a valid level and type, and 1–3 skills from its unit's list. A task with no skill tag fails.
- **Templates:**
  - each template makes at least 5 different variants from 20 seeds, and the same seed always gives the same variant
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
  - Endless-mode choice: it never uses a unit that isn't completed, sets combined tasks only with 2+ units, makes variants once bank tasks run out, and never gives the same task twice in a row
- **Placement tasks and misconceptions:**
  - at least 2 placement tasks per placement level per unit
  - every misconception id is in `misconceptions.json`, with at most 3 per task, and each variant's id is in its task's tags
  - stored variant outputs are up to date, every variant fails at least one test, and predict variants give one of the wrong options
  - every id has variants on at least 3 bank tasks, and on at least 3 within the loops units for every id those units use
  - `former_ids` are unique and not used by a current task
- **Units and skills:** the units are listed with Selection followed by the two loops units, and a skill in two units' lists (`accumulator`) counts for the task's own unit.
- **Glow:** every theme has `--glow` and `--glow-outer`, and the glow doesn't pulse with reduced motion.
- **Feature tests** (`tests/features.js`, also runnable on their own with `node tests/features.js`):
  - **Placement:** passes 2 and 5, fails 7 → starts at 5; passes 9 → 8; fails everything → 1. It can't be repeated, and a teacher reset allows it once more with different tasks.
  - **Buttons:** each can be used once per unit, moves by `BUTTON_JUMP_LEVELS`, resets the streaks and logs the change.
  - **Classifier:** one fixture per failure category, each with a friendly message.
  - **Matching:** an answer matching a buggy variant is tagged; one matching none is not.
  - **Data:** every misconception id used in tasks exists. The full export contains every attempt, level change, button use and placement result, and the data dictionary covers every column.
  - **`recheck.py`:** an unchanged export gives the same matches as the app; a new buggy variant changes the matches only for the attempts it applies to; an export that names a moved task by its old id keeps its matches.
- **Simulation:** `tests/simulate.js` runs seven made-up students through the rules. It checks the fast move up, the normal move down and the recovery drop with its ceiling. Run it on its own to see each student's level task by task:

  ```
  node tests/simulate.js
  ```

**In-browser check (optional):** serve the folder and open `http://localhost:8000/tests/browser-check.html`. It runs every bank solution, and one variant of every template, through the real Pyodide worker. It also checks that an infinite loop is stopped by the timeout.

## Files

| File | Purpose |
|---|---|
| `index.html`, `home.js` | Landing page: name screen, unit menu, links to My progress and Endless mode, test-mode controls |
| `practice.html`, `app.js` | Practice session for one unit, or Endless mode: task types, hints, the editor, the adaptive rules and their constants |
| `progress.html`, `progress.js` | Progress summary and skill drill-down |
| `endless.html`, `endless.js` | Endless mode set-up: choosing units |
| `teacher.html`, `teacher.js` | Teacher view (Overview, Detail log, Workshop) and export |
| `teacher-data.js` | Teacher view sums, filters, full export and data dictionary (no DOM, so it's tested in Node) |
| `misconceptions.json` | The fixed list of misconception ids, names and descriptions |
| `recheck.py` | Re-runs misconception matching over an exported full-data CSV |
| `tools/build-variants.js` | Stores each buggy variant's outputs in `tasks.json` |
| `tools/run-python.js` | Runs programs through `harness.py` with local Python (used by the tests and the build tool) |
| `store.js` | Everything saved in `localStorage` (progress, attempts, level, button and placement logs), plus the theme and overlay controls shared by every page |
| `curriculum.js` | Units, skill lists and the level ladder (shared) |
| `styles.css` | Shared styles and the three themes' colour tokens |
| `tasks.json` | The task bank |
| `templates.json`, `templates.js` | Task templates, and the code that turns a template into a task |
| `worker.js` | Web Worker that loads Pyodide and runs code |
| `harness.py` | Runs a program with test inputs and captures stdout (shared by the worker and the test script) |
| `checker.js` | Output comparison, plain-English error explanations, failure classification and misconception matching |
| `tests/validate.js` | Node test script (runs everything) |
| `tests/features.js` | Tests for placement, buttons, the classifier, matching, the export and `recheck.py` |
| `tests/simulate.js` | Simulation of the adaptive rules with made-up students |
| `tests/browser-check.html` | Optional in-browser check that uses the real Pyodide |

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
- **The name is not a login.** Anyone using the browser can pick any name from the "Change name" list. It is there to keep progress apart on a shared computer, not to secure it.
- **Progress is per browser, per computer.** Clearing browser data deletes it. To collect results, export the full data on each machine.
- **Storage is limited to about 5 MB per site.** Every attempt is stored, with code and output for failed ones (cut to 2000 characters each), up to 3000 attempts per student. On a shared computer used by a whole class this can fill up. The teacher view warns at about 4 MB; export the full data regularly.
- **Very long outputs are cut short in the export.** The app matches misconceptions on the full output, but stores only the first 2000 characters. So `recheck.py` could disagree with the app for an attempt that printed more than that without being stopped (endless loops are matched on how they ended, not their output, so they're not affected).
- **Variant outputs come from local Python, students' from Pyodide.** Matching compares printed output and a short, version-independent error label, not Python's own error text. Even so, a variant whose output differs between Python versions could match slightly differently in the browser.
- **Misconception matching only covers bank and placement tasks** that have buggy variants. Template tasks (Endless mode, write-from-scratch) are classified but never matched.
- **No misconception ids yet for Output and sequence ideas** such as `sep=`/`end=` or the order of statements, so most of that unit's placement tasks have no variants.
- **Placement uses the highest level passed**, as the brief says, even if an earlier one was failed. For example, failing 2 but passing 5 starts at 5.
- **Test mode is not protected.** Anyone who adds `?test=1` to the URL can set levels. Every change is logged in the teacher view.
- **Internet is needed the first time.** Pyodide comes from cdn.jsdelivr.net. If it can't load, the page says so and code can't be run.
- **Answers are visible to a determined student.** Without a backend, `tasks.json`, including the solutions, is downloaded to the browser.
- **4 tasks per level in the newer units** (all except Selection). A student who drops back to a level they've done may see a task again. Unpassed tasks come first, and the task just done is never repeated straight away.
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
- **Template variants aren't hand-checked one by one.** The test script proves every variant's solution, expected output and starter are consistent, but a teacher should still read the templates for wording.
- **Combined tasks move two levels.** A combined task's result counts in each unit it uses, so one fail in Endless mode can count towards a move down in two units.
- **Python versions differ slightly.** The test script uses your local Python, while the browser uses Pyodide 0.26.4 (Python 3.12).
- **Accessibility testing has limits.** Keyboard use has been tested automatically, but the app hasn't been tried with a real screen reader.
