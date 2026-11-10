-- The A-level programming techniques units (migration 0011): every table that names a unit accepts the seven new
-- units, the earlier units, endless progress and every task type still work, and unknown units are still refused.
-- Runs in one transaction that is rolled back. Run against the local database:
-- node tests/sql/run.js a-level-programming-techniques-units.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('eeeeeeee-0000-0000-0000-0000000000a1', 'al-teacher@example.test');
insert into public.teachers (id, name) values ('eeeeeeee-0000-0000-0000-0000000000a1', 'Teacher A');
insert into public.classes (id, teacher_id, name) values ('eeeeeeee-0000-0000-0000-0000000ac1a5', 'eeeeeeee-0000-0000-0000-0000000000a1', 'Class A');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('eeeeeeee-0000-0000-0000-0000000a57d1', 'eeeeeeee-0000-0000-0000-0000000ac1a5', 'Student A', 'al-lookup', 'enc', 'hash');

do $$
declare
  u text;
  ty text;
  n int;
  k int := 0;
begin
  -- The seven new units, and some earlier ones, in every table that names a unit.
  foreach u in array array['recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging',
      'merge-sort', 'trace-tables', 'validation', 'output'] loop
    k := k + 1;
    insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-0000000a57d1', u, json_build_object('level', 1 + k % 9));
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('eeeeeeee-0000-0000-0000-0000000a57d1', u, u || '-task');
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result)
      values ('a-al-' || k, 'eeeeeeee-0000-0000-0000-0000000a57d1', 'attempt', now(), u, u || '-task', 'predict', 'pass');
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-al-' || k, 'eeeeeeee-0000-0000-0000-0000000a57d1', 'level_change', now(), u, 1, 2, 'passes');
    select level into n from public.progress where student_id = 'eeeeeeee-0000-0000-0000-0000000a57d1' and unit = u;
    if n <> 1 + k % 9 then raise exception 'FAIL: % progress should read level %', u, 1 + k % 9; end if;
  end loop;
  insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-0000000a57d1', 'endless', '{"level": 1}');
  select count(*) into n from public.attempts where student_id = 'eeeeeeee-0000-0000-0000-0000000a57d1'
    and unit in ('recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging');
  if n <> 7 then raise exception 'FAIL: the attempts in the seven new units should be stored (found %)', n; end if;

  -- Every task type still works, in a new unit.
  k := 0;
  foreach ty in array array['predict', 'fill', 'parsons', 'write', 'scratch', 'trace', 'partial-parsons'] loop
    k := k + 1;
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, task_type, result, failure_category, failed_test_number)
      values ('a-alty-' || k, 'eeeeeeee-0000-0000-0000-0000000a57d1', 'attempt', now(), 'oop-classes', 'cls-L5b', ty, 'fail', 'WRONG_OUTPUT', 2);
  end loop;

  -- Still refused: units that aren't in the course, and a new unit spelt another way.
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-al-x', 'eeeeeeee-0000-0000-0000-0000000a57d1', 'attempt', now(), 'quick-sort', 'x', 'pass');
    raise exception 'FAIL: an unknown unit was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('eeeeeeee-0000-0000-0000-0000000a57d1', 'oop', 'x');
    raise exception 'FAIL: an unknown unit was accepted in passed_tasks';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-0000000a57d1', 'Recursion', '{"level": 1}');
    raise exception 'FAIL: a unit id with a capital letter was accepted in progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-al-x', 'eeeeeeee-0000-0000-0000-0000000a57d1', 'level_change', now(), 'oop_classes', 1, 2, 'passes');
    raise exception 'FAIL: oop_classes (with _) was accepted in events';
  exception when check_violation then null;
  end;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-al-y', 'eeeeeeee-0000-0000-0000-0000000a57d1', 'attempt', now(), 'big-o', 'x', 'pass');
    raise exception 'FAIL: big-o (not built) was accepted in attempts';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept the seven A-level units; earlier units, endless and every task type still work; unknown units are refused';
end $$;

rollback;
