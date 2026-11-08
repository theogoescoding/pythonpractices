-- The validation and authentication units (migration 0009): every table that names a unit accepts them, the earlier
-- units (including the four added by 0008) still work, and unknown units are still refused. Runs in one transaction
-- that is rolled back. Run against the local database:
-- node tests/sql/run.js validation-authentication-units.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('eeeeeeee-0000-0000-0000-0000000000e1', 'va-teacher@example.test');
insert into public.teachers (id, name) values ('eeeeeeee-0000-0000-0000-0000000000e1', 'Teacher V');
insert into public.classes (id, teacher_id, name) values ('eeeeeeee-0000-0000-0000-0000000ec1a5', 'eeeeeeee-0000-0000-0000-0000000000e1', 'Class V');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('eeeeeeee-0000-0000-0000-000000e057d1', 'eeeeeeee-0000-0000-0000-0000000ec1a5', 'Student V', 'va-lookup', 'enc', 'hash');

do $$
declare
  u text;
  n int;
  k int := 0;
begin
  foreach u in array array['validation', 'authentication', 'arrays-2d', 'file-handling', 'functions-basic', 'strings', 'output'] loop
    k := k + 1;
    insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-000000e057d1', u, json_build_object('level', k + 2));
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('eeeeeeee-0000-0000-0000-000000e057d1', u, u || '-task');
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-va-' || k, 'eeeeeeee-0000-0000-0000-000000e057d1', 'attempt', now(), u, u || '-task', 'pass');
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-va-' || k, 'eeeeeeee-0000-0000-0000-000000e057d1', 'level_change', now(), u, k + 1, k + 2, 'passes');
    select level into n from public.progress where student_id = 'eeeeeeee-0000-0000-0000-000000e057d1' and unit = u;
    if n <> k + 2 then raise exception 'FAIL: % progress should read level %', u, k + 2; end if;
  end loop;
  insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-000000e057d1', 'endless', '{"level": 1}');
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-va-x', 'eeeeeeee-0000-0000-0000-000000e057d1', 'attempt', now(), 'searching', 'x', 'pass');
    raise exception 'FAIL: an unknown unit was accepted in attempts';
  exception when check_violation then null;
  end;
  begin
    insert into public.passed_tasks (student_id, unit, fingerprint) values ('eeeeeeee-0000-0000-0000-000000e057d1', 'login', 'x');
    raise exception 'FAIL: an unknown unit was accepted in passed_tasks';
  exception when check_violation then null;
  end;
  begin
    insert into public.progress (student_id, unit, state) values ('eeeeeeee-0000-0000-0000-000000e057d1', 'Validation', '{"level": 1}');
    raise exception 'FAIL: a unit id with a capital letter was accepted in progress';
  exception when check_violation then null;
  end;
  begin
    insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
      values ('l-va-x', 'eeeeeeee-0000-0000-0000-000000e057d1', 'level_change', now(), 'endless', 1, 2, 'passes');
    raise exception 'FAIL: endless was accepted in events (it is only a progress unit)';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept validation and authentication; earlier units still work; unknown units are refused';
end $$;

rollback;
