-- The data-types unit (migration 0006): every table that names a unit accepts it, and still refuses unknown units.
-- Runs in one transaction that is rolled back. Run against the local database: node tests/sql/run.js data-types-unit.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-0000000000d1', 'dt-teacher@example.test');
insert into public.teachers (id, name) values ('dddddddd-0000-0000-0000-0000000000d1', 'Teacher D');
insert into public.classes (id, teacher_id, name) values ('dddddddd-0000-0000-0000-0000000dc1a5', 'dddddddd-0000-0000-0000-0000000000d1', 'Class D');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('dddddddd-0000-0000-0000-000000d057d1', 'dddddddd-0000-0000-0000-0000000dc1a5', 'Student D', 'dt-lookup', 'enc', 'hash');

do $$
declare n int;
begin
  insert into public.progress (student_id, unit, state) values ('dddddddd-0000-0000-0000-000000d057d1', 'data-types', '{"level": 4}');
  insert into public.passed_tasks (student_id, unit, fingerprint) values ('dddddddd-0000-0000-0000-000000d057d1', 'data-types', 'types-L3a');
  insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
    values ('a-dt-1', 'dddddddd-0000-0000-0000-000000d057d1', 'attempt', now(), 'data-types', 'types-L3a', 'pass');
  insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
    values ('l-dt-1', 'dddddddd-0000-0000-0000-000000d057d1', 'level_change', now(), 'data-types', 3, 4, 'passes');
  select level into n from public.progress where student_id = 'dddddddd-0000-0000-0000-000000d057d1' and unit = 'data-types';
  if n <> 4 then raise exception 'FAIL: data-types progress should read level 4'; end if;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-dt-2', 'dddddddd-0000-0000-0000-000000d057d1', 'attempt', now(), 'strings', 'x', 'pass');
    raise exception 'FAIL: an unknown unit was accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS: progress, passed tasks, attempts and events accept the data-types unit, and still refuse unknown units';
end $$;

rollback;
