# Exam Mode: decisions log

## 1. Where Exam Mode lives (decided 24 Nov 2026)
- A **section inside Pythons and Ladders**, not a separate site. Same nicknames, class codes, PINs and Supabase project.
- **Access:** all patterns open. If a student hasn't done the matching Pythons and Ladders levels, show a warning ("You haven't done Level X yet") but let them carry on.
- **Teacher control:** one on/off switch per class. Default from the class stage: on for GCSE, off for KS3 and A-level (decision 15).
- **Marking display:** show the total (e.g. 4/6) **and** every mark point with a tick or cross and one plain-English line.

## 2. Storing answers and AI marking (decided 24 Nov 2026)
- **Stored:** mark-point results (which points were got or missed, and why). **Updated 24 Nov (decision 15):** failed attempts' code and output are also kept for 30 days, the same rule as the rest of the site.
- **AI marking: parked** until everything else is fully tested. Reason: it isn't free (free AI tiers use submitted data for training, so a paid account would be needed), and setup is a fair bit of work (Supabase Edge Function for the key, AI-readable mark schemes, misuse limits, accuracy checking, DPIA). Estimated cost if added later: about $0.0004 per answer with a small model, roughly $6 a term at pilot scale (5 schools).
- **Marking now:** all in the browser. Fixed answers for rungs 1–3 and Quickfire; tests plus code-structure checks for rungs 4–5. Pythons and Ladders runs on **Pyodide**, so checks can use Python's `ast` module.
- **When the checks can't decide a mark point:** student self-checks. Show the model answer for that point and ask "Does your answer do this?". Record it as self-marked, kept separate from auto-marked results.
- **Knock-on:** "explain" questions (e.g. purpose of the swaps flag) become choose-the-best-explanation questions; free-written ERL/pseudocode can't be auto-marked (see decision 3).

## 3. Python or ERL (decided 24 Nov 2026)
- **Answers: Python only.** OCR Exam Reference Language (ERL) is taught as a reading skill, not an answer language.
- **Questions shown in ERL**, as in the exam. A "show in Python" button is available on rungs 1–3 (Decode, Skeleton, Fill the gaps) and removed on rungs 4–5.
- **Missing `int()` around `input()`:** if code fails only because of this type error, rerun with `input()` returning numbers and **award the marks** (the mark schemes say "ignore conversion to int on input"). Add the note: "Your answer would get the marks in the exam. In real Python, add `int()` around `input()`."

## 4. Where the questions come from (decided 24 Nov 2026)
- **Original questions in OCR's style.** No OCR question text on the site (OCR pages allow photocopying for use in the centre, not publishing on a site for other schools).
- **Build method: a mix.** Templates with swappable contexts and numbers for Quickfire and rungs 1–4; hand-written full questions for rung 5.
- **Rough size:** 16 patterns × 3–4 full exam-style questions (≈50–60, each with a bullet-point mark scheme), plus a Quickfire bank of ≈150–200 short items.
- **Drafting:** Claude drafts questions and mark schemes from the catalogue, matching OCR wording and mark-point style; Theo checks and edits.
- **Contexts:** familiar settings (gaming, football, music, part-time jobs, local places) at rungs 1–3; exam-style settings (businesses, hotels, cinemas, schools) at rungs 4–5 and in full questions.

## 5. Checking the marking is accurate (decided 24 Nov 2026)
- **Method: a test set of answers with known marks** for every question. Claude drafts fully correct answers, typical partial answers and the common mistakes from examiner comments, each with the examiner's mark point by point. Run before a question goes live and again after every change to the marker.
- **Pass level:** the marker must agree with the examiner mark on **at least 95% of mark points** across the question's test answers. Any mark point that's wrong in the same direction every time is fixed regardless.
- **Lean: strict.** When unsure, don't award the mark automatically; send it to student self-check (decision 2).
- **Not chosen for now:** real paper answers typed in by Theo; a "Do you think this mark is wrong?" dispute button. Risk: the test set only covers mistakes we predict. Either can be added after the pilot if unexpected marking problems show up.

## 6. Specification scope (decided 24 Nov 2026)
- **Just programming** (J277 2.2, SQL excluded). AND/OR conditions inside code and validation written as code stay in.
- **In:** writing code from bullet points, writing functions/procedures, using/calling functions, gap-fill code, predict the output, identify parts of code (variables, constants, line with concatenation/casting/function call, constructs, number of parameters), recognising constructs (switch = selection), single statements.
- **Out:** flowcharts, truth tables, definitions, explaining given code, find-and-fix errors (**back in scope, decision 18**), data types, test data/test plans, maintainability, inputs/outputs, trace tables (existing P&L section).
- The question catalogue has a matching scope box.

## 7. Course, timing and first release (decided 24 Nov 2026)
- **OCR J277 only.** All pilot schools teach J277. No AQA or H446 in Exam Mode.
- **Timing:** work starts this week; no fixed deadline ("it will take however long it needs to take").
- **First release: all 16 patterns** in scope, not a core subset.

## 8. Teacher views, leaderboard, homework and reports (decided 24 Nov 2026)
- **Teacher views:** class misconceptions (most-missed mark points), pack progress (rungs reached), per-student scores, and self-check rate (built in EM2 per question, not per mark point; accepted in decision 26).
- **Leaderboard (separate, visible to students and teacher, by nickname):**
  - *Average % correct:* all time, minimum 5 questions answered.
  - *Most improved:* average % in the last 7 days vs the 7 days before; minimum 5 questions in the period.
  - **Only auto-marked points count.** Self-marked points show to the student and teacher but not on the leaderboard.
- **Homework:** keep the existing format (teacher picks a section and a number of tasks). Exam Mode becomes one of the section options, and Exam Mode answers count. **One task = one question answered**, any rung (a Quickfire item counts the same as a full question).
- **Assignments:** Exam Mode questions can be used in the existing assignments feature.
- **Reports:** add scores per pattern, misconceptions, rung reached per pattern, and Exam Mode homework results to the existing reports.

## 9. Retries (decided 24 Nov 2026)
- A **retry** = pressing "Try again" on the same question after being marked, and resubmitting.
- **Allowed until the student opens the model answer.** After that, further tries are practice only and are not recorded.
- **First attempt counts** for the leaderboard, scores and reports.
- **Homework:** a retry counts as a task **only if it gets more marks** than the previous attempt (blind resubmits don't count).

## 10. Moving through the rungs (decided 24 Nov 2026)
- **All rungs open**, with a nudge to start lower if earlier rungs haven't been done (same approach as the pattern-level warning).
- **Passing a rung:** at least 80% of first-attempt marks across 3 questions at that rung. Used for progress, reports and nudges.
- **Doing badly:** suggest the rung below **and** link the matching Pythons and Ladders level.
- Note: this drop-back suggestion is a next-step prompt for **Exam Mode only**; next-step prompts are still ruled out for the rest of Pythons and Ladders.

## 11. Exam-style practice (decided 24 Nov 2026)
- **Mixed sets:** a separate mode of full exam-style questions from several patterns, with the pattern **not named**. No timer.
  - The **student chooses** which blocks to include (updated by decision 19; was patterns) and how big the set is.
  - **Marked after each question** (feedback straight away).
  - Same rules as elsewhere: first attempt counts for scores and leaderboard; each question answered counts as a homework task.
- **Decode (rung 1) starts with "Which blocks does this question need?"** (updated after decisions 18–19; was "Which pattern is this?"). Then the student tags each bullet.

## 12. Running code and the editor (decided 24 Nov 2026)
- **Run button on rung 4 only** (building the answer one bullet at a time). No running on rung 5 full questions or in mixed sets, so those feel like the exam.
- **Editor:** the same as the main Pythons and Ladders editor.

## 13. Build process, model answers, help button, storage, names (decided 24 Nov 2026)
- **Build process:** planning happens in a Claude chat in this project, which produces a prompt for Claude Code running in VS Code on Theo's PC. Theo commits and pushes with GitHub Desktop.
- **After each submission** the student gets three choices: **Retry**, **See the model answer and the full mark scheme** (ends retries for that question), or **Move on**.
- **"Say it simply" button (plain-English version of the question) on rungs 1–3:** available. Each use is recorded and slows progress through the rungs (details in decision 14).
- **Question storage:** ~~Supabase table~~ **updated (decision 15): JSON files in the repo**, like `tasks.json`. Only questions written by us for now; Supabase only if teacher-written questions come later.
- **Pattern names students see:** decide after seeing a full worked example. Names must not give away which construct to use, and must not be meaningless jargon.
- **Rung 4 marks** count towards the leaderboard and pattern scores, even though running code is allowed there.

## 14. "Say it simply" penalty and content review (decided 24 Nov 2026)
- **Rung progress:** a question answered after using "say it simply" counts as **half a question** towards the 3 needed to pass a rung.
- **Leaderboard:** helped questions count, but at **reduced points: 50%**, matching the half-question rule (Theo can change the percentage).
- **Reviewing content packs:** one readable doc per pattern for Theo to check and comment on. Once approved, Claude produces the structured data file (JSON) for that pattern, and Claude Code adds it to the repo, where `tests/validate.js` runs its test answers.
- **Each content pack contains:** full questions (ERL, exam-style bullets) · bullet-point mark scheme with OCR-style rules · model answer (Python + ERL) · one plain-English feedback line per mark point · rung 1–4 activities · the template (swappable parts) · test answers with known marks · the "say it simply" version.

## Repo findings (theogoescoding/pythonpractices, checked 24 Nov 2026 at commit a7bddf9; facts about the site as it was then. Since decisions 18–19, "patterns" elsewhere in this log means blocks and combinations)
- **Tasks live in the repo, not in Supabase:** `tasks.json` (1,661 bank tasks) and `templates.json` (1,653 templates), checked by `node tests/validate.js` using `harness.py` (same runner Pyodide loads in `worker.js`). Supabase holds classes, students, progress, attempts, homework, assignments, certificates and events only.
- **40 units, each with levels 1–10** (output, variables, maths, selection, loops-condition, loops-count, data-types, strings, random, lists, functions-basic, functions-return, file-handling, arrays-2d, validation and its sub-units, trace-tables, searching/sorting, debugging-gcse, plus A-level units). Exam Mode's "you haven't done Level X yet" map will point at these unit/level pairs.
- **Existing task types** Exam Mode can reuse: `predict` (predict the output), `fill` (gap fill), `parsons` and `partial-parsons` (put lines in order, i.e. the Skeleton rung), `write`.
- **Misconceptions** are matched by output (a failed attempt's output compared with stored "buggy variant" outputs), not by reading code structure. Exam Mode's mark-point checks (Python `ast`) would be a new checker alongside `checker.js`.
- **Failed attempts' code and output are stored for 30 days** (`0004_retention.sql`, and the draft privacy notice says so). This differs from Exam Mode's "no code stored" decision.
- **Homework** (`0018_homework.sql`): teacher sets `task_count`, `due_on` and a list of `units`; Exam Mode can be added as one of those unit options. **Assignments** (`0005_assignments.sql`) are a list of `task_ids`, so Exam Mode question ids can go in.
- **Classes already have a stage:** `ks3`, `gcse` or `a-level` (`0013_class_stage.sql`).
- **Leaderboards** exist (`leaderboard.js`, points rule in `secured.js`); Exam Mode's board would be a separate one.

## 15. Changes after reading the repo (decided 24 Nov 2026)
- **Questions are stored as JSON in the repo** (like `tasks.json` / `templates.json`), not in Supabase. The existing test suite runs each question's test answers automatically. Supabase only if teacher-written questions come later.
- **Code storage follows the site's 30-day rule:** failed attempts' code and output are kept for 30 days, then cleared (`0004_retention.sql`); mark-point results are kept as normal. Replaces "no code stored". The privacy notice already covers this.
- **On/off switch defaults from the class stage:** on for GCSE classes, off for KS3 and A-level. The teacher can switch it either way.

## 16. Fitting into the site (decided 24 Nov 2026)
- **Kept separate from the main site's points:** Exam Mode work adds nothing to main leaderboard points and earns no certificates. It has its own leaderboard, scores and reports.
- **Paste flag: same as the rest of the site.** Whole-program and long pastes are flagged; flagged answers don't count for homework, the Exam Mode leaderboard or scores.
- **No existing hints or "Show me how" in Exam Mode.** Help is only "say it simply" (rungs 1–3), retries, and the model answer.
- **Students (Claude's recommendation; Theo to confirm once built):** Exam Mode is its own area, **`exam.html`**, with its own look (different accent colour and an "Exam Mode" header) so it feels like a different part of the site. Reached from a tile on the student's main page and an "Exam Mode" item in the student menu. Inside it has its own navigation: **Packs** (the landing page), Blocks, My exam scores, then Mixed sets and Exam leaderboard when built (updated after EM1b; was Patterns, then Pack C1). Shown only when the class has Exam Mode switched on.
- **Teachers (Claude's recommendation; Theo to confirm once built):** one new **"Exam Mode" page in the teacher view** with everything for the selected class: pattern progress grid (rungs reached), most-missed mark points, per-student scores, self-check and "say it simply" rates, the Exam Mode leaderboard, and the class on/off switch. Exam Mode also appears where teachers already look: as a section option in the Homework form and its homework report, in Reports and the export, and in Assignments. The existing Misconceptions page gets a one-line link to the Exam Mode page rather than a second copy.
- **OCR spec codes:** each pattern gets its J277 code(s) in `curriculum-codes.json`, shown on the teacher Curriculum page like the units (assumed; not explicitly confirmed).

## 17. P1 content pack approved (24 Nov 2026)
- Theo approved the P1 pack ("Repeat until a stop value") as the format for all 16 patterns, including the five judgement-call marks (C4, A5, A7, B2, B3) and every place Claude made a recommendation.
- Marker requirements found from the test runs (go into the build prompt): rerun with numeric inputs when `int()` is missing; treat a NameError on an expected word (`yes`, `stop`) as text and penalise once; treat a timeout as "loop doesn't stop" via `run_code_limited`; treat NoMoreInput as "doesn't stop on the stop value"; match outputs as numbers, not exact text; give every test one spare input after the stop value and check whether it was used.
- **Pattern names: exam cue phrases.** Each pattern is named after the words students will see in the question, e.g. P1 "…until 0 / stop is entered", P3 "…10 values" / "…how many to enter", P4 "…each item in the array", P7 "…takes … as parameters and returns …", P9 "…between … and … inclusive", P13 "…keeps track of how many times …", P16 "…stores … to the text file". The name adds nothing the question doesn't already say, and it teaches students to spot the cue.
- **No decisions are left open.**

## 18. Restructure after the 2022–2025 paper analysis (decided 25 Nov 2026)
Based on the analysis doc "How OCR J277 Paper 2 programming questions work (2022–2025 analysis)" (all four live J277 Paper 2s, mark schemes, 2024 and 2025 examiners' reports):
- **Exam Mode is organised around building blocks and combinations, not 16 scenario patterns.** Blocks first by evidence: the 7 seen in all four papers (input and store; selection; two conditions / inclusive ranges; count-controlled loop or loop over an array; array index from the loop counter; running total / count / update; define a function or procedure), then the 3-paper blocks (condition-controlled loop; call a function and use its result; string handling; output a message with a variable; arithmetic incl. MOD/DIV), then rare ones at low weight (casting, files, highest/lowest, random). Each block carries its cue phrases, code, mark points and known mistakes. Progression: one bullet → one block, two blocks, the core combination (input + loop + selection + update + output, which ends Section B every year), full 4–6 mark questions in new contexts.
- The 16 patterns become **combinations** to cover; the approved P1 pack is an example of the core combination. Cue-phrase names now attach to blocks.
- **Fix/refine is back in scope** (2–4 marks in every paper): identify the line, write the corrected line. Replaces the "find and fix errors: out" line in decision 6.
- **Regular ERL-reading practice** is added (questions are always given in ERL; 2025 4(a) and 6(a)(i) needed it), beyond the "show in Python" button.
- Every block is practised in all three formats the papers use: write from blank, complete given ERL code, fix/refine a line.

## 19. Building blocks reference agreed (decided 25 Nov 2026)
Reference doc: "Exam Mode building blocks (reference)": 17 blocks in three tiers, each with cue phrases, Python and ERL code, mark points, known mistakes (from the 2024/2025 examiners' reports where named) and an example of each format.
- **Order for students:** teaching order, following how Pythons and Ladders builds up (roughly B1 input, B2 selection, B4 count loop, B8 condition loop, B6 running total, B5 array loop, B3 two conditions, B11 output with variable, B10 strings, B12 arithmetic, B7 define subprogram, B9 call subprogram, then tier 3: B13 2D arrays, B14 casting, B15 files, B16 highest/lowest, B17 random). Tiers set how often each block comes up in mixed practice.
- **Four formats per block:** write, complete, fix, and read the ERL.
- **Content packs:** one pack per block (17) plus about 8 combination packs, replacing the 16 pattern packs. The approved P1 pack becomes the first combination pack (the core combination: input + loop + selection + update + output).
- **Mixed sets:** students choose blocks (not patterns), and every set includes at least one core-combination question. Replaces "student chooses patterns" in decision 11.

## 20. EM1 built (25 Nov 2026)
Claude Code built prompt EM1 (not yet committed when reported).
- `node tests/exam-mode.js`: 141 of 141 checks. Marker agreement 94/94 mark points (C1-Q0 16/16, C1-Q1 42/42, C1-Q2 36/36). All 4 extra checks pass; A6 carries `int`, A5 and B4 carry `quotes-fixed`. `node tests/validate.js` still passes.
- **Live files:** `exam-mode.json` and `exam_marker.py` at the repo root (the copies in `docs/exammode/` are planning copies only). New: `exam.html`, `exam.js`, `tests/exam-mode.js`. Changed: `worker.js` (loads the marker, `mark` message with optional `check` for rung 4), `app.html` (menu item; the tile/banner was removed in EM1b), `styles.css` (Exam Mode colours in all three themes), `tests/validate.js` (contrast pairs), README.
- **Changes Claude Code made, accepted:**
  - the marker gained `check_step` (rung 4 steps, same repairs, no penalties) and `run_tests`
  - Exam Mode records and their paste flags use their own browser storage key
  - Decode hides the answer-format line (it gave away the format question)
  - ERL view is display only and Parsons lines stay in Python
  - code that still won't parse goes to "check yourself"
- Next: EM2 (backend recording, per-class switch, teacher Exam Mode page).

## 21. After trying EM1 (decided 25 Nov 2026)
Theo's review of EM1: rungs 2–5 work well; rung 1 needs rebuilding; more main-site features needed.
- **Main site:** remove the big banner at the top of the landing page, keep its button (too noisy).
- **Rung 1 rebuilt** as two concrete tasks; the block-ticking question, the bullet-tagging question and the answer-format question are removed:
  1. **Bullet to code:** for each bullet, pick the line that earns its mark from 3–4 options; wrong options are real mistakes from the examiners' reports and mark schemes. The block name is shown after answering.
  2. **Mark it like an examiner:** two short student answers side by side (contrasting answers); pick which earns the mark and why.
- **Tutorial** on first visit to Exam Mode: what blocks are, how bullets become mark points, answer formats (riders).
- **Variety across rungs:** each rung uses a different context with the same blocks (e.g. rung 2 gaming café, rung 3 tuck shop, rung 4 football club, rung 5 exam contexts), so a rung can't be copied from the one before.
- **Exam Mode landing page** mirroring the main site: a card per pack with rung reached, first-attempt and best score, and Continue.
- **Secured score and revisiting** as on the main site: a pack's score fades over time; redoing a pack gives new variants (templates), not the same questions.
- Still out: hints, "Show me how", certificates, main-site points (decision 16 stands).
- **"Do you think this mark is wrong?" button: still no.**
- **Marker fixes from Theo's test answer** (quiz, `while x != "" or x != "stop":`, marked 4/6, fair mark 5/6):
  - no double penalty: BP4 follows through on BP3 (judged on structure when the loop condition is wrong)
  - misconception-specific feedback: detect always-true `!= A or != B` conditions and say so ("Your loop never stops…")
  - add this answer as test answer B7, expected BP3 ✗, everything else ✓, total 5
- **Build order (decided 25 Nov 2026):** EM1b student fixes (banner, landing page, tutorial, rung 1 rebuild, a different context per rung, marker fixes) → EM2 server, class switch, teacher overview → EM3 leaderboard, homework, assignments, reports → EM4 variants/templates, secured score, revisiting.

## 22. EM1b built (25 Nov 2026)
Claude Code built EM1b from decision 21 (no separate prompt file). Not yet synced to the pythonpractices repo when reported.
- **Gate:** 244 of 244 checks; marker agreement 148/148 mark points (playlist 28, café 16, tuck shop 12, football 8, bowling 42, quiz 42). validate.js, features and backend-client tests still pass.
- **Built:** Exam Mode banner removed from the main page (menu button kept); landing page with a card per pack (rung reached, first-attempt and best full-question score, Continue → first untried rung, then first untried full question); navigation Packs, Blocks, My exam scores; 4-screen tutorial on first visit plus a "How Exam Mode works" link; rung 1 rebuilt (Bullet to code with reasons for wrong picks; Mark it like an examiner with 3 pairs); a context per rung: **rung 1 playlist**, rung 2 gaming café, rung 3 tuck shop (5 gaps, including the start value), rung 4 football club (stop value -1, because 0 goals is a real score), rung 5 bowling and quiz.
- **Marker:** test answer B7 (Theo's quiz answer) scores 5/6, losing only BP3. BP4 and BP6 follow through on BP3; asking for name and score together still loses BP4. Always-true `!= A or != B` loop tests get a specific feedback line. The same follow-through was applied to the café and bowling questions (covered by extra checks only, not approved test answers).
- **Also changed:** rung 1 shows the answer-format line again (the format question that gave it away has gone); attempts from before EM1b show in My exam scores but don't count towards "rung reached".
- **Waiting for Theo's check (Claude Code's drafts):** the playlist, tuck shop and football questions with mark points and feedback; every rung 1 wrong line and reason; the three examiner pairs and reasons; the tutorial text; the judgement call that in rung 1 pair 1 the loop that never asks again still gets the output mark (follow-through on the loop mark).

## 23. Clearer block names for students (decided 26 Nov 2026)
Students found cue-phrase titles ("…until … is entered") confusing. The constraint that names mustn't reveal the construct went when the "which pattern" question was removed from rung 1 (decision 21), so blocks are now named plainly.
- **Layout: plain job first.** Title = what the code does (e.g. "Keep asking until a stop value"); then "In the question you'll see:" with 1–2 example sentences in quotes (written in OCR style, not copied); "What to write:" with Python (ERL under it behind a "Show ERL" toggle); "Exam term:"; "Common mistake:" (one line).
- Wording for all 17 blocks approved by Theo: `exam-mode-block-display.json`. Used on the Blocks page, in rung 1 feedback and in the tutorial. No ellipsis titles shown to students.
- Built by prompt EM1c.

## 24. EM1c built, wording fixes (27 Nov 2026)
EM1c built: plain-job-first layout on the Blocks page, rung 1 feedback, tutorial, landing and pack pages; tests 284/284, marker agreement still 148/148. Accepted from Claude Code: titles in normal case (not capitals); no B1–B17 labels shown to students; long code lines scroll inside their box on phones; the pack's display title "Core combination: keep asking until a stop value".
Fixes (approved file updated):
- **B4** ERL is `for i = 0 to 2` so `i` takes the same values as Python's `range(3)`.
- **B7** example sentence rewritten without "…".
- **B16** exam term is "maximum, minimum".
- **Rung 1 feedback** names the block by its title and quotes the bullet from the current question, not the block's general example (so the playlist question doesn't mention hours or seconds).

## 25. Prompts EM2 and EM3 written (27 Nov 2026)
Theo checked the EM1b content himself and approved it.
- **EM2** (`docs/exammode/EM2-prompt.md`): `exam_attempts` table (migration 0021) with mark-point results, auto/self totals, notes, help used, paste flag, `assignment_id`, code only for attempts under full marks (cleared after 30 days); new event types (`exam_model_seen`, `exam_tutorial_seen`); `student-api` `add_exam_attempts` and `get_exam_progress`; `classes.exam_mode` (null = by stage: on for GCSE); `teacher-api` `set_exam_mode`, `exam_overview`, `exam_student_detail`; teacher Exam Mode page (switch, pack overview, most-missed mark points, self-check and help rates, student detail); privacy notice lines. Marking stays in the browser and the server trusts it (accepted for the pilot).
- **EM3** (`docs/exammode/EM3-prompt.md`): leaderboard rules made exact: counted = first attempts only, auto-marked points only (self-marked left out of scored and possible), paste-flagged excluded, "say it simply" first attempts count marks scored at 50% with marks possible in full; boards need ≥5 questions in the window (most improved: ≥5 in each week). Homework: Exam Mode as a section; one task per question and rung, first recorded attempt counts, a retry counts again only if higher than every earlier attempt; self-marked and helped attempts still count as tasks. Assignments take Exam Mode question ids and work even when the class switch is off. Reports and export get Exam Mode scores, rung reached, most-missed points and homework results.

## 26. EM2 built (27 Nov 2026)
Claude Code built EM2 (not yet deployed or synced when reported). Tests: exam-mode 288/288 (marker 148/148), validate, features 974/974, backend-client 107/107, SQL tests 0015–0021 in a rolled-back transaction (17 files pass). Browser checks done against a stand-in server running the real `exam-server.js`; the live `tests/backend/run.js` tests and the Deno bundling of `teacher-api`'s JSON import are not yet verified.
- **Accepted changes from the prompt:** `step` also holds rung 1's part (1 or 2); the model-answer rule refuses only tries made after it was opened; Exam Mode events have no unit (only those two types); paste flag is a column, not an event; `set_exam_mode` accepts null (back to the stage default); the server checks sums exactly; an unanswered "check yourself" point is stored as `{awarded: null, status: "self"}` and counts as self-checked, not missed; code is sent for rungs 2–5 when marks were lost; `exam_student_detail` takes the student id.
- **Self-check rate is per question**, not per mark point (accepted).
- **"Rung reached" = highest rung tried** for now; decision 10's 80%-on-3 rule comes with EM4.
- **Paste-flagged answers (decision 16) are left out of scores everywhere:** teacher overview, most-missed mark points, My exam scores, leaderboard and homework. They still show, marked "Paste flagged". Added to EM3.
- **Misconceptions page link** to the Exam Mode page (decision 16): added to EM3.
- Earlier "local mode only" notes in decisions 20 and 22 are superseded by EM2.
- **Deploy order:** migration first (`supabase migration list`, then `db push`), then deploy `student-api` and `teacher-api` (and `join-class`, `resume` if the domain-move origins aren't deployed yet), and only then sync and push the site. Test project before the trial project.

## 27. Wrong answers don't block rungs 1–4 (decided 27 Nov 2026)
Theo found students stuck on a step of rungs 1–4 until they got it right. Students must be able to get a step wrong and move on.
- After the first check on any step of rungs 1–4 (each rung 1 part, i.e. all bullets together and all examiner pairs together (updated in decision 28); the Parsons check; rung 3 gaps; each rung 4 step), the student gets three buttons: **Try again**, **Show answer**, **Next**. This matches decision 13 for full questions.
- **Next** is disabled until the first check, so every step must be tried once. Pressing Next on a wrong step fills in the correct version first, so the next step builds on working code. The student's own version is what gets recorded.
- **Show answer** is recorded with `exam_model_seen`.
- The first check is what counts (decision 13). Later right answers show "Correct on try n" to the student only.
- The rung summary lists steps that were shown or wrong first time, with "Try this step again" links. These are practice only.
- No database change. Added to prompt EM3 as section 6.

## 28. EM3 built (27 Nov 2026)
Claude Code built EM3 (not yet deployed or synced when reported). No new migration; `student-api` and `teacher-api` need redeploying. Tests: exam-mode 299/299 (marker 148/148), validate all passed, features 974/974, backend-client 118/118, SQL tests 32 passed. Browser checks at 1280px and 390px: section 6 in local mode (32), sections 1–5 against a stand-in server running the real `exam-server.js` and `homework-server.js` (25). The live `tests/backend/run.js` tests not yet run.
- **Accepted changes from the prompt:**
  - Rung 1's three buttons are per part (all bullets, all examiner pairs), not per bullet, because each part is checked and recorded as one record.
  - Show answer's `exam_model_seen` uses a step-scoped id (e.g. `C1-R4-r4-s2`) so later steps of the same question aren't refused. Later tries of that step aren't recorded.
  - Rung 4 steps have their correct code in `exam-mode.json` (the model answer built up step by step, checked by the gate). Rung 3 reads its answers from the model program.
  - The end-of-rung summary is on rungs 1 and 4 only (rungs 2 and 3 have one step each).
  - In rung 4, code Python can't read counts as a wrong check, so Next still works.
  - Homework set as "any unit" doesn't count Exam Mode; only homework with the Exam Mode section does.
  - A paste-flagged try still counts as an earlier attempt for homework, so retyping a pasted answer doesn't count either. A paste-flagged first attempt leaves no first-attempt score; the next try doesn't take its place.
  - A question with no auto-marked points isn't counted on the leaderboard.
  - The teacher Leaderboards page works the board out in the browser from the class's rows, with the same rule (no new `teacher-api` action).
  - The export is one "Exam Mode (CSV)" file in three sections (pack scores, most-missed mark points, homework).
  - EM2's overview arithmetic moved into `exam.js` (`classOverview`), shared by the server, Reports and the export.
- **Homework retries:** a retry counts again only if it beats every earlier attempt (EM3 prompt), replacing "the previous attempt" in decision 9.


## 29. Problems found testing EM3 on the trial project (27 Nov 2026)
Theo's live checks after deploying EM3:
- **Assignments:** an Exam Mode item can be set, but the student opens the assignment and sees no tasks. With a normal task added, the student sees only that task, and finishing it completes and closes the assignment. Exam Mode items aren't shown or counted towards completion.
- **Homework:** the student's homework card can't be clicked through to Exam Mode, and Exam Mode answers (rungs included) don't count as homework tasks.
- **Misconceptions page:** the link line shows, but Exam Mode isn't in the unit drop-down. **Decided (Claude's recommendation):** add "Exam Mode" to the drop-down; picking it shows the class's most-missed Exam Mode mark points on that page (the same data and code as the Exam Mode page), with the link kept. Replaces "a link rather than a second copy" in decision 16.
- EM3's browser checks ran against a stand-in server, not the real project, and `tests/backend/run.js` wasn't run. The fix (prompt EM3b) starts there.

## 30. EM3b built, homework counting settled (27 Nov 2026)
Claude Code built EM3b (not yet deployed when reported). No migration; `student-api` and `teacher-api` need redeploying. Tests: exam-mode 300/300 (marker 148/148), backend-client 125/125, features 977/977, validate passed; browser checks 24/24 at 1280px and 390px against a stand-in running the real server code.
- **Assignments cause:** `practice.html?assignment=…` (the "Open it" reminder link, and the home card if clicked before `exam-mode.json` loaded) only looked ids up in `tasks.json`, so Exam Mode items were dropped and completion came from bank tasks alone. Server and database were fine. Fixed: every item listed in order with Not tried yet / Tried / ✓ Done; complete only when every item is done (rung 1 both parts, rung 4 every step; a shown part counts as done); `student-api` sends which Exam Mode questions are done; teacher view gets a "Done" column.
- **Homework cause:** no code bug found. EM3's rule compared retries with every earlier attempt, including ones from before the homework was set, so test students who had already done pack C1 had nothing left to count.
- **Decided (Claude's recommendations, Theo to confirm):**
  - **Each homework starts afresh:** only answers made after it was set count, and only those set the bar for a retry.
  - **One homework task per rung, not per step:** rung 1 counts once when both parts are done; rung 4 counts once when every step is done; each full question counts once. Replaces EM3's one task per rung 1 part and per rung 4 step (decision 8 says one task = one question answered).
  - **All homework cards link through:** unit cards open their unit, as Exam Mode cards now open Exam Mode.
  - Exam Mode opens while the class has open Exam Mode homework, even when the class switch is off (accepted, matching assignments).
- **Misconceptions:** "Exam Mode" is the last drop-down option (only when Exam Mode is on), showing most-missed mark points in place of "Most-failed tasks"; link line kept.
- **Backend tests:** `tests/backend/run.js` only runs against the test project (`qiggrpwzfowhhcjrlauq`), needing `tests/backend/config.local.json` with the service-role key. Not run yet.
