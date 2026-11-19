-- The Debugging (GCSE) unit (migration 0020): every table that names a unit accepts debugging-gcse; the A-level
-- debugging unit, the earlier units and endless progress still work; a wrong answer to the error question (failure
-- category WRONG_ERROR_KIND, no test number) is stored; unknown units are still refused. Runs in one transaction that is
-- rolled back. Run against the local database, once 0020 is applied there: node tests/sql/run.js debugging-gcse-unit.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('ffffffff-0000-0000-0000-0000000000d7', 'dg-teacher@example.test');
insert into public.teachers (id, name) values ('ffffffff-0000-0000-0000-0000000000d7', 'Teacher D');
insert into public.classes (id, teacher_id, name) values ('ffffffff-0000-0000-0000-0000000dc1a7', 'ffffffff-0000-0000-0000-0000000000d7', 'Class D');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('ffffffff-0000-0000-0000-0000000d57d1', 'ffffffff-0000-0000-0000-0000000dc1a7', 'Student D', 'dg-lookup', 'enc', 'hash');

do $$
declare
  u text;
  ty text;
  n int;
  k int := 0;
begin
  -- The new unit, the A-level debugging unit and some earlier ones, in every table that names a unit.
  foreach u in array array['debugging-gcse', 'debugging', 'authentication', 'trace-tables', 'validation-length', 'output'] loop
    k := k + 1;
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', u, json_build_object('level', 1 + k % 9));
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-0000000d57d1', u, u || '-task');
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-dg-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), u, u || '-task', 'predict', 'pass');
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-dg-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'level_change', now(), u, 1, 2, 'passes');
  end loop;
  insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', 'endless', '{"level": 1}');
  select count(*) into n from public.attempts where student_id = 'ffffffff-0000-0000-0000-0000000d57d1' and unit = 'debugging-gcse';
  if n <> 1 then raise exception 'FAIL: the attempt in debugging-gcse should be stored (found %)', n; end if;

  -- Every task type the unit uses, and a wrong answer to the error question (no program was run, so no test number).
  k := 0;
  foreach ty in array array['predict', 'fill', 'parsons', 'write'] loop
    k := k + 1;
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result, failure_category, failure_details)
      values ('a-dgty-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), 'debugging-gcse', 'bug-L7a', ty, 'fail', 'WRONG_ERROR_KIND',
        '{"wrong": [0], "answers": ["logic"]}');
  end loop;
  -- A paste flag in the new unit (migrations 0018 and 0019).
  insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, paste_phase, paste_lines)
    values ('f-dg-1', 'ffffffff-0000-0000-0000-0000000d57d1', 'paste_flag', now(), 'debugging-gcse', 'bug-L9a', 'practice', 12);

  -- Still refused: units that aren't in the course, and the new unit spelt another way.
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-dg-x', 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), 'debugging_gcse', 'x', 'pass');
    raise exception 'FAIL: debugging_gcse (with _) was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-0000000d57d1', 'debugging-a-level', 'x');
    raise exception 'FAIL: an unknown unit was accepted in passed_tasks';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', 'Debugging-gcse', '{"level": 1}');
    raise exception 'FAIL: a unit id with a capital letter was accepted in progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-dg-x', 'ffffffff-0000-0000-0000-0000000d57d1', 'level_change', now(), 'gcse-debugging', 1, 2, 'passes');
    raise exception 'FAIL: gcse-debugging was accepted in events';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept debugging-gcse; the A-level debugging unit, earlier units, endless, every task type it uses and a WRONG_ERROR_KIND attempt still work; unknown units are refused';
end $$;

rollback;
