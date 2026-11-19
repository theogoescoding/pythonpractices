-- Homework (migration 0018): who can read and write homework and homework_progress, and the paste_flag event.
-- Runs in one transaction that is rolled back, so it leaves nothing behind. Each check raises an error if it fails;
-- with ON_ERROR_STOP, psql then exits non-zero.
-- Run against the local database, once 0016 and 0018 are applied there: node tests/sql/run.js homework.sql
--
-- The checks:
--   1. A teacher on the class (owner, and co-teacher) reads its homework and its students' progress.
--   2. A teacher outside the class sees none of it, and can't add or delete its homework.
--   3. A teacher on the class can add homework (always as themselves) and delete it; no teacher writes progress.
--   4. anon (and so a student, whose requests are anon until student-api) can't read or write either table.
--   5. The paste_flag event needs an f- id and a task id; homework checks its units; progress goes with its homework.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher P owns class P (student P1), shared with co-teacher Q. Teacher R has class R (student R1) and no
-- membership of class P. Each class has one homework, with a progress row for its student.
insert into auth.users (id, email) values
  ('0000001f-0000-0000-0000-000000000001', 'hw-p@example.test'),
  ('0000001f-0000-0000-0000-000000000002', 'hw-q@example.test'),
  ('0000001f-0000-0000-0000-000000000003', 'hw-r@example.test');
insert into public.teachers (id, name) values
  ('0000001f-0000-0000-0000-000000000001', 'Teacher P'),
  ('0000001f-0000-0000-0000-000000000002', 'Teacher Q'),
  ('0000001f-0000-0000-0000-000000000003', 'Teacher R');
insert into public.classes (id, teacher_id, name) values
  ('0000001f-0000-0000-0000-00000000c1a1', '0000001f-0000-0000-0000-000000000001', 'Class P'),
  ('0000001f-0000-0000-0000-00000000c1a3', '0000001f-0000-0000-0000-000000000003', 'Class R');
insert into public.class_teachers (class_id, teacher_id, added_by) values
  ('0000001f-0000-0000-0000-00000000c1a1', '0000001f-0000-0000-0000-000000000002', '0000001f-0000-0000-0000-000000000001');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('0000001f-0000-0000-0000-0000000057d1', '0000001f-0000-0000-0000-00000000c1a1', 'Student P1', 'hw-lookup-p1', 'enc', 'hash'),
  ('0000001f-0000-0000-0000-0000000057d3', '0000001f-0000-0000-0000-00000000c1a3', 'Student R1', 'hw-lookup-r1', 'enc', 'hash');
-- As teacher-api and student-api save them (service role).
insert into public.homework (id, class_id, created_by, task_count, due_on, units) values
  ('0000001f-0000-0000-0000-0000000000a1', '0000001f-0000-0000-0000-00000000c1a1', '0000001f-0000-0000-0000-000000000001', 5, '2026-12-01', '{}'),
  ('0000001f-0000-0000-0000-0000000000a3', '0000001f-0000-0000-0000-00000000c1a3', '0000001f-0000-0000-0000-000000000003', 3, '2026-12-01', '{maths,selection}');
insert into public.homework_progress (homework_id, student_id, done, complete, units, task_ids) values
  ('0000001f-0000-0000-0000-0000000000a1', '0000001f-0000-0000-0000-0000000057d1', 2, false, '{selection}', '{if-L3a,if-L4a}'),
  ('0000001f-0000-0000-0000-0000000000a3', '0000001f-0000-0000-0000-0000000057d3', 3, true, '{maths}', '{maths-L1a,maths-L2a,maths-L3a}');

-- ---------- 5. The paste_flag event and the homework checks ----------
do $$
begin
  insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id)
    values ('f-mabc123-x1y2z3', '0000001f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'selection', 'if-L5a');
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit)
      values ('f-mabc124-x1y2z3', '0000001f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'selection');
    raise exception 'FAIL: a paste flag without a task id was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id)
      values ('x-mabc125-x1y2z3', '0000001f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'selection', 'if-L5a');
    raise exception 'FAIL: an event with an unknown id prefix was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.homework (class_id, task_count, due_on) values ('0000001f-0000-0000-0000-00000000c1a1', 0, '2026-12-01');
    raise exception 'FAIL: homework with no tasks was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.homework (class_id, task_count, due_on, units) values ('0000001f-0000-0000-0000-00000000c1a1', 3, '2026-12-01', '{"Bad unit"}');
    raise exception 'FAIL: homework with a bad unit id was saved';
  exception when check_violation then null;
  end;
  raise notice 'PASS: a paste flag is an event with an f- id and a task id; homework needs 1 or more tasks and real unit ids';
end $$;

-- ---------- 1. Owner P reads class P's homework and progress, and nothing else ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000001f-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
begin
  if (select array_agg(id::text) from public.homework) is distinct from array['0000001f-0000-0000-0000-0000000000a1'] then
    raise exception 'FAIL: teacher P should see class P''s homework and nothing else';
  end if;
  if (select array_agg(student_id::text) from public.homework_progress) is distinct from array['0000001f-0000-0000-0000-0000000057d1'] then
    raise exception 'FAIL: teacher P should see student P1''s homework progress and nothing else';
  end if;
  if not exists (select 1 from public.events where record_type = 'paste_flag' and task_id = 'if-L5a') then
    raise exception 'FAIL: teacher P should see their student''s paste flag';
  end if;
  raise notice 'PASS: a teacher sees the homework and progress of their own class only (and its paste flags)';
end $$;

-- ---------- 1 and 3. Co-teacher Q sees the same, adds homework as themselves, and deletes it ----------
select set_config('request.jwt.claims', '{"sub": "0000001f-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
declare
  new_id uuid;
begin
  if (select array_agg(id::text) from public.homework) is distinct from array['0000001f-0000-0000-0000-0000000000a1'] or
     (select count(*) from public.homework_progress) <> 1 then
    raise exception 'FAIL: co-teacher Q should see the same homework and progress as the owner';
  end if;
  insert into public.homework (class_id, task_count, due_on, units) values ('0000001f-0000-0000-0000-00000000c1a1', 4, '2026-12-05', '{output}')
    returning id into new_id;
  if (select created_by from public.homework where id = new_id) is distinct from '0000001f-0000-0000-0000-000000000002'::uuid then
    raise exception 'FAIL: homework a teacher adds should be theirs';
  end if;
  begin
    insert into public.homework (class_id, created_by, task_count, due_on) values ('0000001f-0000-0000-0000-00000000c1a1', '0000001f-0000-0000-0000-000000000001', 4, '2026-12-05');
    raise exception 'FAIL: a teacher added homework in another teacher''s name';
  exception when insufficient_privilege then null;
  end;
  delete from public.homework where id = new_id;
  if exists (select 1 from public.homework where id = new_id) then
    raise exception 'FAIL: a co-teacher couldn''t delete the class''s homework';
  end if;
  raise notice 'PASS: a co-teacher sees the same as the owner, and adds (always as themselves) and deletes the class''s homework';
end $$;

-- ---------- 2 and 3. Teacher R (outside class P) sees none of it, can't add or delete it; nobody writes progress ----------
select set_config('request.jwt.claims', '{"sub": "0000001f-0000-0000-0000-000000000003", "role": "authenticated"}', true);
do $$
declare
  stmt text;
begin
  if exists (select 1 from public.homework where class_id = '0000001f-0000-0000-0000-00000000c1a1') or
     exists (select 1 from public.homework_progress where student_id = '0000001f-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: teacher R can see class P''s homework or progress';
  end if;
  if (select count(*) from public.homework) <> 1 or (select count(*) from public.homework_progress) <> 1 then
    raise exception 'FAIL: teacher R should see only their own class''s homework and progress';
  end if;
  begin
    insert into public.homework (class_id, task_count, due_on) values ('0000001f-0000-0000-0000-00000000c1a1', 2, '2026-12-05');
    raise exception 'FAIL: teacher R added homework to class P';
  exception when insufficient_privilege then null;
  end;
  delete from public.homework where id = '0000001f-0000-0000-0000-0000000000a1'; -- finds nothing it may delete
  foreach stmt in array array[
    'insert into public.homework_progress (homework_id, student_id, done) values (''0000001f-0000-0000-0000-0000000000a3'', ''0000001f-0000-0000-0000-0000000057d3'', 1)',
    'update public.homework_progress set done = 99',
    'delete from public.homework_progress',
    'update public.homework set task_count = 1'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: a teacher was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: a teacher outside the class sees none of its homework or progress and can''t add it; no teacher can write progress or change homework';
end $$;

-- ---------- 4. anon can't read or write either table ----------
reset role;
do $$
begin
  if not exists (select 1 from public.homework where id = '0000001f-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: teacher R deleted class P''s homework';
  end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select count(*) from public.homework',
    'select count(*) from public.homework_progress',
    'insert into public.homework (class_id, task_count, due_on) values (''0000001f-0000-0000-0000-00000000c1a1'', 1, ''2026-12-01'')',
    'insert into public.homework_progress (homework_id, student_id) values (''0000001f-0000-0000-0000-0000000000a1'', ''0000001f-0000-0000-0000-0000000057d1'')',
    'delete from public.homework'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: anon (and so a student) can''t read or write homework or homework progress';
end $$;

-- ---------- 5. Progress goes with its homework ----------
reset role;
delete from public.homework where id = '0000001f-0000-0000-0000-0000000000a1';
do $$
begin
  if exists (select 1 from public.homework_progress where homework_id = '0000001f-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: a deleted homework''s progress was kept';
  end if;
  raise notice 'PASS: a homework''s progress is deleted with it';
end $$;

reset role;
rollback;
