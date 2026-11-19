-- Paste flag details (migration 0019): events.paste_phase, paste_lines and paste_homework_id.
-- Runs in one transaction that is rolled back, so it leaves nothing behind. Each check raises an error if it fails;
-- with ON_ERROR_STOP, psql then exits non-zero.
-- Run against the local database, once 0016, 0018 and 0019 are applied there: node tests/sql/run.js paste-flag-details.sql
--
-- The checks:
--   1. The three columns are null for every event that isn't a paste flag (and the database refuses anything else).
--   2. A paste flag may have them: a phase from the list, a line count above 0, a homework of the student's own class.
--      An older flag (all three null) is still allowed.
--   3. A teacher on the class reads them; a teacher outside the class can't read them; no teacher can write them.
--   4. anon (and so a student) can't read them.
--   5. Deleting the homework leaves the flag, with no homework.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher P owns class P (student P1, homework HP). Teacher R owns class R (student R1, homework HR).
insert into auth.users (id, email) values
  ('0000002f-0000-0000-0000-000000000001', 'pf-p@example.test'),
  ('0000002f-0000-0000-0000-000000000003', 'pf-r@example.test');
insert into public.teachers (id, name) values
  ('0000002f-0000-0000-0000-000000000001', 'Teacher P'),
  ('0000002f-0000-0000-0000-000000000003', 'Teacher R');
insert into public.classes (id, teacher_id, name) values
  ('0000002f-0000-0000-0000-00000000c1a1', '0000002f-0000-0000-0000-000000000001', 'Class P'),
  ('0000002f-0000-0000-0000-00000000c1a3', '0000002f-0000-0000-0000-000000000003', 'Class R');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('0000002f-0000-0000-0000-0000000057d1', '0000002f-0000-0000-0000-00000000c1a1', 'Student P1', 'pf-lookup-p1', 'enc', 'hash'),
  ('0000002f-0000-0000-0000-0000000057d3', '0000002f-0000-0000-0000-00000000c1a3', 'Student R1', 'pf-lookup-r1', 'enc', 'hash');
insert into public.homework (id, class_id, created_by, task_count, due_on) values
  ('0000002f-0000-0000-0000-0000000000a1', '0000002f-0000-0000-0000-00000000c1a1', '0000002f-0000-0000-0000-000000000001', 5, '2026-12-01'),
  ('0000002f-0000-0000-0000-0000000000a3', '0000002f-0000-0000-0000-00000000c1a3', '0000002f-0000-0000-0000-000000000003', 5, '2026-12-01');
-- As student-api saves them (service role): a flag with its details, an older flag without, and a level change.
insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, paste_phase, paste_lines, paste_homework_id) values
  ('f-mabc200-aaaaaa', '0000002f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'maths', 'maths-L9b', 'practice', 12, '0000002f-0000-0000-0000-0000000000a1');
insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id) values
  ('f-mabc201-aaaaaa', '0000002f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'maths', 'maths-L9c');
insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason) values
  ('l-mabc202-aaaaaa', '0000002f-0000-0000-0000-0000000057d1', 'level_change', now(), 'maths', 4, 5, 'passes');

-- ---------- 1 and 2. Only paste flags have the details, and only good ones ----------
do $$
declare
  stmt text;
begin
  if exists (select 1 from public.events where record_type <> 'paste_flag' and (paste_phase is not null or paste_lines is not null or paste_homework_id is not null)) then
    raise exception 'FAIL: an event that isn''t a paste flag has paste details';
  end if;
  foreach stmt in array array[
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_after, level_change_reason, paste_lines) values (''l-mabc203-aaaaaa'', ''0000002f-0000-0000-0000-0000000057d1'', ''level_change'', now(), ''maths'', 5, ''passes'', 3)',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, button, paste_phase) values (''b-mabc204-aaaaaa'', ''0000002f-0000-0000-0000-0000000057d1'', ''button_use'', now(), ''maths'', ''too-easy'', ''practice'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, paste_phase) values (''f-mabc205-aaaaaa'', ''0000002f-0000-0000-0000-0000000057d1'', ''paste_flag'', now(), ''maths'', ''t'', ''homework'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, paste_lines) values (''f-mabc206-aaaaaa'', ''0000002f-0000-0000-0000-0000000057d1'', ''paste_flag'', now(), ''maths'', ''t'', 0)'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: the database allowed: %', stmt;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, paste_phase, paste_lines, paste_homework_id)
      values ('f-mabc207-aaaaaa', '0000002f-0000-0000-0000-0000000057d1', 'paste_flag', now(), 'maths', 't', 'practice', 9, '0000002f-0000-0000-0000-0000000000a3');
    raise exception 'FAIL: a paste flag named another class''s homework';
  exception when foreign_key_violation then null;
  end;
  raise notice 'PASS: the three details are null for every other event; a paste flag''s must be a listed phase, more than 0 lines and its own class''s homework (an older flag with none is fine)';
end $$;

-- ---------- 3. Teacher P reads the details; no teacher can write them ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000002f-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
begin
  if (select paste_lines from public.events where record_id = 'f-mabc200-aaaaaa') is distinct from 12 or
     (select paste_phase from public.events where record_id = 'f-mabc200-aaaaaa') is distinct from 'practice' or
     (select paste_homework_id from public.events where record_id = 'f-mabc200-aaaaaa') is distinct from '0000002f-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'FAIL: teacher P should read their student''s paste flag details';
  end if;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, paste_lines)
      values ('p-mabc208-aaaaaa', '0000002f-0000-0000-0000-0000000057d1', 'placement_reset', now(), 'maths', 1);
    raise exception 'FAIL: a teacher wrote a paste detail';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: a teacher on the class reads the paste flag details, and can''t write them';
end $$;

-- ---------- 3. Teacher R (outside class P) can't read them ----------
select set_config('request.jwt.claims', '{"sub": "0000002f-0000-0000-0000-000000000003", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.events where student_id = '0000002f-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: teacher R can read class P''s paste flags';
  end if;
  raise notice 'PASS: a teacher outside the class can''t read the paste flag details';
end $$;

-- ---------- 4. anon can't read them ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
begin
  begin
    perform paste_lines from public.events limit 1;
    raise exception 'FAIL: anon read the paste flag details';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: anon (and so a student) can''t read them';
end $$;

-- ---------- 5. Deleting the homework keeps the flag, with no homework ----------
reset role;
delete from public.homework where id = '0000002f-0000-0000-0000-0000000000a1';
do $$
begin
  if (select paste_homework_id from public.events where record_id = 'f-mabc200-aaaaaa') is not null or
     (select paste_lines from public.events where record_id = 'f-mabc200-aaaaaa') is distinct from 12 then
    raise exception 'FAIL: deleting the homework should keep the flag and clear only its homework';
  end if;
  raise notice 'PASS: deleting a homework keeps its paste flags, with no homework';
end $$;

reset role;
rollback;
