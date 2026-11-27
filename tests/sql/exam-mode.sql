-- Exam Mode (migration 0021): exam_attempts, the class switch and the two Exam Mode events.
-- Runs in one transaction that is rolled back, so it leaves nothing behind. Each check raises an error if it fails;
-- with ON_ERROR_STOP, psql then exits non-zero.
-- Run against the local database, once 0016, 0018 and 0021 are applied there: node tests/sql/run.js exam-mode.sql
--
-- The checks:
--   1. The switch: public.exam_mode_effective for every stage and setting (the same table as tests/backend-client.js
--      checks for exam.js examModeOn); teachers can't change classes.exam_mode directly (only teacher-api does).
--   2. The events: exam_model_seen and exam_tutorial_seen have an x- id and no unit (the model answer names its
--      question); every other event still needs a unit.
--   3. exam_attempts' checks: the sums, the step, the id, code only when marks were lost, one row per record_id.
--   4. Nothing after the model answer: a try made after it is refused, one made before it is kept.
--   5. An attempt can only name an assignment of the student's own class.
--   6. Row-level security: teachers on the class (owner and co-teacher) read their students' rows; another teacher
--      sees none; no teacher writes them; anon (and so a student) can't read or write them.
--   7. Deleting a student, or a class, deletes their exam attempts.
--   8. The nightly job clears code kept more than 30 days; the marks and the code's hash stay.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher P owns class P (GCSE; students P1 and P2), shared with co-teacher Q. Teacher R has class R (KS3; student R1).
insert into auth.users (id, email) values
  ('0000002e-0000-0000-0000-000000000001', 'em-p@example.test'),
  ('0000002e-0000-0000-0000-000000000002', 'em-q@example.test'),
  ('0000002e-0000-0000-0000-000000000003', 'em-r@example.test');
insert into public.teachers (id, name) values
  ('0000002e-0000-0000-0000-000000000001', 'Teacher P'),
  ('0000002e-0000-0000-0000-000000000002', 'Teacher Q'),
  ('0000002e-0000-0000-0000-000000000003', 'Teacher R');
insert into public.classes (id, teacher_id, name, stage) values
  ('0000002e-0000-0000-0000-00000000c1a1', '0000002e-0000-0000-0000-000000000001', 'Class P', 'gcse'),
  ('0000002e-0000-0000-0000-00000000c1a3', '0000002e-0000-0000-0000-000000000003', 'Class R', 'ks3');
insert into public.class_teachers (class_id, teacher_id, added_by) values
  ('0000002e-0000-0000-0000-00000000c1a1', '0000002e-0000-0000-0000-000000000002', '0000002e-0000-0000-0000-000000000001');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('0000002e-0000-0000-0000-0000000057d1', '0000002e-0000-0000-0000-00000000c1a1', 'Student P1', 'em-lookup-p1', 'enc', 'hash'),
  ('0000002e-0000-0000-0000-0000000057d2', '0000002e-0000-0000-0000-00000000c1a1', 'Student P2', 'em-lookup-p2', 'enc', 'hash'),
  ('0000002e-0000-0000-0000-0000000057d3', '0000002e-0000-0000-0000-00000000c1a3', 'Student R1', 'em-lookup-r1', 'enc', 'hash');
insert into public.assignments (id, class_id, title, task_ids) values
  ('0000002e-0000-0000-0000-0000000000a3', '0000002e-0000-0000-0000-00000000c1a3', 'Class R work', '{if-L3a}');
-- As student-api saves them (service role): P1's first try at C1-Q1 (4/6, code kept), P2's (6/6), R1's (5/6).
insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max, student_code, code_hash) values
  ('x-p1a-000001', '0000002e-0000-0000-0000-0000000057d1', now() - interval '1 hour', 'C1', 'C1-Q1', 5, 1, true,
    '[{"id":"BP1","awarded":1,"status":"auto"},{"id":"BP2","awarded":1,"status":"auto"},{"id":"BP3","awarded":1,"status":"auto"},{"id":"BP4","awarded":1,"status":"auto"},{"id":"BP5","awarded":0,"status":"auto"},{"id":"BP6","awarded":0,"status":"auto"}]',
    4, 6, 4, 6, 'print(games * 5)', 'hash-1'),
  ('x-p2a-000001', '0000002e-0000-0000-0000-0000000057d2', now() - interval '1 hour', 'C1', 'C1-Q1', 5, 1, true,
    '[{"id":"BP1","awarded":1,"status":"auto"},{"id":"BP2","awarded":1,"status":"auto"},{"id":"BP3","awarded":1,"status":"auto"},{"id":"BP4","awarded":1,"status":"auto"},{"id":"BP5","awarded":1,"status":"auto"},{"id":"BP6","awarded":1,"status":"self"}]',
    6, 6, 5, 5, null, null),
  ('x-r1a-000001', '0000002e-0000-0000-0000-0000000057d3', now() - interval '1 hour', 'C1', 'C1-Q1', 5, 1, true,
    '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1, null, null);

-- ---------- 1. The switch ----------
do $$
begin
  if public.exam_mode_effective('gcse', null) is not true or public.exam_mode_effective('ks3', null) is not false or
     public.exam_mode_effective('a-level', null) is not false or public.exam_mode_effective(null, null) is not true or
     public.exam_mode_effective('ks3', true) is not true or public.exam_mode_effective('a-level', true) is not true or
     public.exam_mode_effective('gcse', true) is not true or public.exam_mode_effective(null, true) is not true or
     public.exam_mode_effective('gcse', false) is not false or public.exam_mode_effective('ks3', false) is not false or
     public.exam_mode_effective('a-level', false) is not false or public.exam_mode_effective(null, false) is not false then
    raise exception 'FAIL: exam_mode_effective should follow the stage when null (on for GCSE only) and the setting otherwise';
  end if;
  if (select exam_mode from public.classes where id = '0000002e-0000-0000-0000-00000000c1a1') is not null then
    raise exception 'FAIL: a class''s exam_mode should start as null (follow the stage)';
  end if;
  raise notice 'PASS: exam_mode_effective: null follows the stage (on for GCSE, off for KS3 and A-level); true or false wins; new classes start at null';
end $$;

-- ---------- 2. The Exam Mode events ----------
do $$
begin
  insert into public.events (record_id, student_id, record_type, "timestamp", task_id)
    values ('x-mseen-0001', '0000002e-0000-0000-0000-0000000057d1', 'exam_model_seen', now() - interval '30 minutes', 'C1-Q1');
  insert into public.events (record_id, student_id, record_type, "timestamp")
    values ('x-tseen-0001', '0000002e-0000-0000-0000-0000000057d1', 'exam_tutorial_seen', now());
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id)
      values ('x-mseen-0002', '0000002e-0000-0000-0000-0000000057d1', 'exam_model_seen', now(), 'selection', 'C1-Q1');
    raise exception 'FAIL: an Exam Mode event with a unit was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp")
      values ('x-mseen-0003', '0000002e-0000-0000-0000-0000000057d1', 'exam_model_seen', now());
    raise exception 'FAIL: a model answer seen without its question was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", task_id)
      values ('l-noun-0001', '0000002e-0000-0000-0000-0000000057d1', 'level_change', now(), 'if-L3a');
    raise exception 'FAIL: a level change without a unit was saved';
  exception when check_violation or not_null_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", task_id)
      values ('q-mseen-0004', '0000002e-0000-0000-0000-0000000057d1', 'exam_model_seen', now(), 'C1-Q1');
    raise exception 'FAIL: an event with an unknown id prefix was saved';
  exception when check_violation then null;
  end;
  raise notice 'PASS: exam_model_seen (with its question) and exam_tutorial_seen have an x- id and no unit; every other event still needs a unit';
end $$;

-- ---------- 3. exam_attempts' checks ----------
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    -- total above max
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-bad-000001'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 2, 1, 1, 1)',
    -- code kept for full marks
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max, student_code) values (''x-bad-000002'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 1, 1, 1, 1, ''print(1)'')',
    -- a step on rung 5
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, step, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-bad-000003'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 1, 1, 1, 1)',
    -- a record id that isn't Exam Mode's
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''a-bad-000004'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 1, 1, 1, 1)',
    -- auto_total above total
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-bad-000005'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":0,"status":"auto"}]'', 0, 1, 1, 1)',
    -- points that aren't a list
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-bad-000006'', ''0000002e-0000-0000-0000-0000000057d2'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''{"BP1":1}'', 1, 1, 1, 1)'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: a bad exam attempt was saved: %', stmt;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max)
      values ('x-p2a-000001', '0000002e-0000-0000-0000-0000000057d2', now(), 'C1', 'C1-Q1', 5, 2, false, '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1);
    raise exception 'FAIL: the same record_id was saved twice for one student';
  exception when unique_violation then null;
  end;
  -- Rung 1's parts and rung 4's steps have a step.
  insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, step, attempt_number, first, points, total, max, auto_total, auto_max)
    values ('x-p2-step-01', '0000002e-0000-0000-0000-0000000057d2', now(), 'C1', 'C1-R4', 4, 2, 1, true, '[{"id":"step2","awarded":1,"status":"auto"}]', 1, 1, 1, 1);
  raise notice 'PASS: exam_attempts refuses bad sums, code kept for full marks, a step outside rungs 1 and 4, a non-Exam Mode id and points that aren''t a list; one row per record_id';
end $$;

-- ---------- 4. Nothing after the model answer ----------
-- P1 opened C1-Q1's model answer 30 minutes ago (section 2): a try 10 minutes ago is refused, one 40 minutes ago kept.
do $$
begin
  begin
    insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max)
      values ('x-p1-after-01', '0000002e-0000-0000-0000-0000000057d1', now() - interval '10 minutes', 'C1', 'C1-Q1', 5, 2, false, '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1);
    raise exception 'FAIL: a try made after the model answer was opened was saved';
  exception when check_violation then null;
  end;
  insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max)
    values ('x-p1-before-1', '0000002e-0000-0000-0000-0000000057d1', now() - interval '40 minutes', 'C1', 'C1-Q1', 5, 2, false, '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1);
  insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max)
    values ('x-p1-other-1', '0000002e-0000-0000-0000-0000000057d1', now(), 'C1', 'C1-Q2', 5, 1, true, '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1);
  raise notice 'PASS: a try at a question made after its model answer was opened is refused; one made before it, and other questions, are kept';
end $$;

-- ---------- 5. Only an assignment of the student's own class ----------
do $$
begin
  begin
    insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max, assignment_id)
      values ('x-p2-asg-001', '0000002e-0000-0000-0000-0000000057d2', now(), 'C1', 'C1-Q2', 5, 1, true, '[{"id":"BP1","awarded":1,"status":"auto"}]', 1, 1, 1, 1, '0000002e-0000-0000-0000-0000000000a3');
    raise exception 'FAIL: an exam attempt named another class''s assignment';
  exception when foreign_key_violation then null;
  end;
  raise notice 'PASS: an exam attempt can only name an assignment of the student''s own class';
end $$;

-- ---------- 6. Row-level security ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000002e-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
declare
  stmt text;
begin
  if (select array_agg(distinct student_id::text order by student_id::text) from public.exam_attempts) is distinct from
     array['0000002e-0000-0000-0000-0000000057d1', '0000002e-0000-0000-0000-0000000057d2'] then
    raise exception 'FAIL: teacher P should see their two students'' exam attempts and nothing else';
  end if;
  if (select student_code from public.exam_attempts where record_id = 'x-p1a-000001') is distinct from 'print(games * 5)' then
    raise exception 'FAIL: teacher P should see the code of an attempt that lost marks';
  end if;
  foreach stmt in array array[
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-t-000001'', ''0000002e-0000-0000-0000-0000000057d1'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 1, 1, 1, 1)',
    'update public.exam_attempts set total = 6',
    'delete from public.exam_attempts',
    'update public.classes set exam_mode = true'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: a teacher was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: the owner reads their students'' exam attempts (with code) and nothing else; no teacher writes them, or changes exam_mode directly';
end $$;
select set_config('request.jwt.claims', '{"sub": "0000002e-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
begin
  if (select count(*) from public.exam_attempts) <> 5 then
    raise exception 'FAIL: co-teacher Q should see class P''s five exam attempts (got %)', (select count(*) from public.exam_attempts);
  end if;
  raise notice 'PASS: a co-teacher reads the same exam attempts as the owner';
end $$;
select set_config('request.jwt.claims', '{"sub": "0000002e-0000-0000-0000-000000000003", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.exam_attempts where student_id in ('0000002e-0000-0000-0000-0000000057d1', '0000002e-0000-0000-0000-0000000057d2')) or
     (select count(*) from public.exam_attempts) <> 1 then
    raise exception 'FAIL: teacher R should see only their own student''s exam attempt';
  end if;
  raise notice 'PASS: a teacher outside the class sees none of its exam attempts';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select count(*) from public.exam_attempts',
    'insert into public.exam_attempts (record_id, student_id, "timestamp", pack_id, question_id, rung, attempt_number, first, points, total, max, auto_total, auto_max) values (''x-a-000001'', ''0000002e-0000-0000-0000-0000000057d1'', now(), ''C1'', ''C1-Q2'', 5, 1, true, ''[{"id":"BP1","awarded":1,"status":"auto"}]'', 1, 1, 1, 1)',
    'delete from public.exam_attempts'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: anon (and so a student) can''t read or write exam attempts';
end $$;
reset role;

-- ---------- 8. Code kept more than 30 days is cleared; marks and the hash stay ----------
update public.exam_attempts set created_at = now() - interval '31 days' where record_id = 'x-p1a-000001';
do $$
declare
  n int;
begin
  n := public.clear_old_program_code();
  if (select student_code from public.exam_attempts where record_id = 'x-p1a-000001') is not null or
     (select code_deleted_at from public.exam_attempts where record_id = 'x-p1a-000001') is null or
     (select code_hash from public.exam_attempts where record_id = 'x-p1a-000001') is distinct from 'hash-1' or
     (select total from public.exam_attempts where record_id = 'x-p1a-000001') <> 4 or
     (select points from public.exam_attempts where record_id = 'x-p1a-000001') -> 4 ->> 'awarded' <> '0' then
    raise exception 'FAIL: 31-day-old exam code should be cleared, keeping its hash and marks';
  end if;
  if n < 1 then raise exception 'FAIL: clear_old_program_code should count the exam code it cleared'; end if;
  raise notice 'PASS: the nightly job clears exam code kept more than 30 days (code_deleted_at set); the marks and code_hash stay';
end $$;

-- ---------- 7. Deleting a student, or a class, deletes their exam attempts ----------
delete from public.students where id = '0000002e-0000-0000-0000-0000000057d2'; -- as delete_my_progress and a teacher's Remove do
do $$
begin
  if exists (select 1 from public.exam_attempts where student_id = '0000002e-0000-0000-0000-0000000057d2') then
    raise exception 'FAIL: a deleted student''s exam attempts were kept';
  end if;
  raise notice 'PASS: deleting a student (Delete everything saved for me, or a teacher) deletes their exam attempts';
end $$;
delete from public.classes where id = '0000002e-0000-0000-0000-00000000c1a1'; -- as a teacher's Delete class and the class ending do
do $$
begin
  if exists (select 1 from public.exam_attempts where student_id = '0000002e-0000-0000-0000-0000000057d1') or
     exists (select 1 from public.events where student_id = '0000002e-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: a deleted class''s exam attempts or events were kept';
  end if;
  if not exists (select 1 from public.exam_attempts where student_id = '0000002e-0000-0000-0000-0000000057d3') then
    raise exception 'FAIL: another class''s exam attempts were deleted';
  end if;
  raise notice 'PASS: deleting a class deletes its students'' exam attempts and Exam Mode events; other classes keep theirs';
end $$;

reset role;
rollback;
