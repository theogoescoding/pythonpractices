-- The trace tables and searching and sorting units, and the trace and partial-parsons task types (migration 0010):
-- every table that names a unit accepts the six new units, attempts accept the two new task types, the earlier units
-- and task types still work, and unknown units and task types are still refused. Runs in one transaction that is
-- rolled back. Run against the local database:
-- node tests/sql/run.js searching-sorting-trace-units.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('ffffffff-0000-0000-0000-0000000000f1', 'ss-teacher@example.test');
insert into public.teachers (id, name) values ('ffffffff-0000-0000-0000-0000000000f1', 'Teacher S');
insert into public.classes (id, teacher_id, name) values ('ffffffff-0000-0000-0000-0000000fc1a5', 'ffffffff-0000-0000-0000-0000000000f1', 'Class S');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('ffffffff-0000-0000-0000-000000f057d1', 'ffffffff-0000-0000-0000-0000000fc1a5', 'Student S', 'ss-lookup', 'enc', 'hash');

do $$
declare
  u text;
  ty text;
  n int;
  k int := 0;
begin
  -- The six new units, and some earlier ones, in every table that names a unit.
  foreach u in array array['trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort',
      'validation', 'authentication', 'arrays-2d', 'output'] loop
    k := k + 1;
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-000000f057d1', u, json_build_object('level', 1 + k % 9));
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-000000f057d1', u, u || '-task');
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-ss-' || k, 'ffffffff-0000-0000-0000-000000f057d1', 'attempt', now(), u, u || '-task', 'predict', 'pass');
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-ss-' || k, 'ffffffff-0000-0000-0000-000000f057d1', 'level_change', now(), u, 1, 2, 'passes');
    select level into n from public.progress where student_id = 'ffffffff-0000-0000-0000-000000f057d1' and unit = u;
    if n <> 1 + k % 9 then raise exception 'FAIL: % progress should read level %', u, 1 + k % 9; end if;
  end loop;
  insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-000000f057d1', 'endless', '{"level": 1}');

  -- Every task type: the five earlier ones and the two new ones.
  k := 0;
  foreach ty in array array['predict', 'fill', 'parsons', 'write', 'scratch', 'trace', 'partial-parsons'] loop
    k := k + 1;
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result, failure_category, failed_test_number)
      values ('a-ty-' || k, 'ffffffff-0000-0000-0000-000000f057d1', 'attempt', now(), 'bubble-sort', 'bub-L5d', ty, 'fail', 'WRONG_OUTPUT', 3);
  end loop;
  select count(*) into n from public.attempts where student_id = 'ffffffff-0000-0000-0000-000000f057d1' and task_type in ('trace', 'partial-parsons');
  if n <> 2 then raise exception 'FAIL: the trace and partial-parsons attempts should be stored (found %)', n; end if;

  -- Still refused: an unknown unit, an unknown task type, and a new task type spelt another way.
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-ss-x', 'ffffffff-0000-0000-0000-000000f057d1', 'attempt', now(), 'quick-sort', 'x', 'pass');
    raise exception 'FAIL: an unknown unit was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-000000f057d1', 'searching', 'x');
    raise exception 'FAIL: an unknown unit was accepted in passed_tasks';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-000000f057d1', 'Merge-sort', '{"level": 1}');
    raise exception 'FAIL: a unit id with a capital letter was accepted in progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-ss-x', 'ffffffff-0000-0000-0000-000000f057d1', 'level_change', now(), 'sorting', 1, 2, 'passes');
    raise exception 'FAIL: an unknown unit was accepted in events';
  exception when check_violation then null;
  end;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-ty-x', 'ffffffff-0000-0000-0000-000000f057d1', 'attempt', now(), 'output', 'x', 'trace-table', 'pass');
    raise exception 'FAIL: an unknown task type was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-ty-y', 'ffffffff-0000-0000-0000-000000f057d1', 'attempt', now(), 'output', 'x', 'partial_parsons', 'pass');
    raise exception 'FAIL: partial_parsons (with _) was accepted as a task type';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept the six new units; attempts accept trace and partial-parsons; earlier units and types still work; unknown units and types are refused';
end $$;

rollback;
