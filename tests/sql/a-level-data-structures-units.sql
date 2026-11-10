-- The A-level data structures units (migration 0012): every table that names a unit accepts the five new units, the
-- earlier units (the programming techniques units too), endless progress and every task type still work, and unknown
-- units are still refused. Runs in one transaction that is rolled back. Run against the local database, once 0012 is
-- applied there: node tests/sql/run.js a-level-data-structures-units.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('ffffffff-0000-0000-0000-0000000000d5', 'ds-teacher@example.test');
insert into public.teachers (id, name) values ('ffffffff-0000-0000-0000-0000000000d5', 'Teacher D');
insert into public.classes (id, teacher_id, name) values ('ffffffff-0000-0000-0000-0000000dc1a5', 'ffffffff-0000-0000-0000-0000000000d5', 'Class D');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('ffffffff-0000-0000-0000-0000000d57d1', 'ffffffff-0000-0000-0000-0000000dc1a5', 'Student D', 'ds-lookup', 'enc', 'hash');

do $$
declare
  u text;
  ty text;
  n int;
  k int := 0;
begin
  -- The five new units, and some earlier ones, in every table that names a unit.
  foreach u in array array['records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d',
      'debugging', 'recursion', 'merge-sort', 'arrays-2d', 'output'] loop
    k := k + 1;
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', u, json_build_object('level', 1 + k % 9));
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-0000000d57d1', u, u || '-task');
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-ds-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), u, u || '-task', 'predict', 'pass');
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-ds-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'level_change', now(), u, 1, 2, 'passes');
    select level into n from public.progress where student_id = 'ffffffff-0000-0000-0000-0000000d57d1' and unit = u;
    if n <> 1 + k % 9 then raise exception 'FAIL: % progress should read level %', u, 1 + k % 9; end if;
  end loop;
  insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', 'endless', '{"level": 1}');
  select count(*) into n from public.attempts where student_id = 'ffffffff-0000-0000-0000-0000000d57d1'
    and unit in ('records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d');
  if n <> 5 then raise exception 'FAIL: the attempts in the five new units should be stored (found %)', n; end if;

  -- Every task type still works, in a new unit.
  k := 0;
  foreach ty in array array['predict', 'fill', 'parsons', 'write', 'scratch', 'trace', 'partial-parsons'] loop
    k := k + 1;
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result, failure_category, failed_test_number)
      values ('a-dsty-' || k, 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), 'linked-lists', 'll-L5b', ty, 'fail', 'WRONG_OUTPUT', 2);
  end loop;

  -- Still refused: units that aren't in the course, and a new unit spelt another way.
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-ds-x', 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), 'graphs', 'x', 'pass');
    raise exception 'FAIL: an unknown unit was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('ffffffff-0000-0000-0000-0000000d57d1', 'stacks', 'x');
    raise exception 'FAIL: an unknown unit was accepted in passed_tasks';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress (student_id, unit, state) values ('ffffffff-0000-0000-0000-0000000d57d1', 'Hash-tables', '{"level": 1}');
    raise exception 'FAIL: a unit id with a capital letter was accepted in progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-ds-x', 'ffffffff-0000-0000-0000-0000000d57d1', 'level_change', now(), 'linked_lists', 1, 2, 'passes');
    raise exception 'FAIL: linked_lists (with _) was accepted in events';
  exception when check_violation then null;
  end;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-ds-y', 'ffffffff-0000-0000-0000-0000000d57d1', 'attempt', now(), 'trees', 'x', 'pass');
    raise exception 'FAIL: trees (not built) was accepted in attempts';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept the five A-level data structures units; earlier units, endless and every task type still work; unknown units are refused';
end $$;

rollback;
