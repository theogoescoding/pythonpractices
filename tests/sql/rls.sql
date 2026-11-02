-- Row-level security checks. Runs in one transaction that is rolled back, so it leaves nothing behind.
-- Each check raises an error if it fails; with ON_ERROR_STOP, psql then exits non-zero.
-- Run against the local database: node tests/sql/run.js

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher A has class A with student A; teacher B has class B with student B. Teacher C has no teachers row.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'teacher-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'teacher-b@example.test'),
  ('cccccccc-0000-0000-0000-000000000001', 'teacher-c@example.test');
insert into public.teachers (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Teacher A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Teacher B');
insert into public.classes (id, teacher_id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000c1a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class A'),
  ('bbbbbbbb-0000-0000-0000-00000000c1a5', 'bbbbbbbb-0000-0000-0000-000000000001', 'Class B');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-0000000057d1', 'aaaaaaaa-0000-0000-0000-00000000c1a5', 'Student A', 'lookup-a', 'enc-a', 'hash-a'),
  ('bbbbbbbb-0000-0000-0000-0000000057d1', 'bbbbbbbb-0000-0000-0000-00000000c1a5', 'Student B', 'lookup-b', 'enc-b', 'hash-b');
insert into public.progress (student_id, unit, state) values
  ('aaaaaaaa-0000-0000-0000-0000000057d1', 'selection', '{"level": 3, "placement": {"status": "done", "used": ["sel-P2a"]}}'),
  ('bbbbbbbb-0000-0000-0000-0000000057d1', 'selection', '{"level": 5, "completedTop": false}');
insert into public.passed_tasks (student_id, unit, fingerprint) values
  ('aaaaaaaa-0000-0000-0000-0000000057d1', 'selection', 'if-L3a'),
  ('bbbbbbbb-0000-0000-0000-0000000057d1', 'selection', 'if-L5a');
insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values
  ('a-test-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L3a', 'pass'),
  ('a-test-2', 'bbbbbbbb-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L5a', 'fail');
insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason) values
  ('l-test-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'level_change', now(), 'selection', 2, 3, 'passes'),
  ('l-test-2', 'bbbbbbbb-0000-0000-0000-0000000057d1', 'level_change', now(), 'selection', 4, 5, 'passes');
insert into public.code_reveals (teacher_id, class_id, student_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-00000000c1a5', 'bbbbbbbb-0000-0000-0000-0000000057d1');

-- Every table and every server-only function, for the anon checks.
create temporary table rls_tables (name text) on commit drop;
insert into rls_tables values ('teachers'), ('classes'), ('students'), ('progress'), ('passed_tasks'),
  ('attempts'), ('events'), ('code_reveals');
grant select on rls_tables to anon, authenticated;

-- ---------- anon sees nothing ----------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

do $$
declare
  t text;
  stmt text;
begin
  for t in select name from rls_tables loop
    foreach stmt in array array[
      format('select count(*) from public.%I', t),
      format('insert into public.%I default values', t),
      format('update public.%I set created_at = created_at', t),
      format('delete from public.%I', t)
    ] loop
      if t = 'code_reveals' then stmt := replace(stmt, 'created_at = created_at', 'revealed_at = revealed_at'); end if;
      if t = 'progress' then stmt := replace(stmt, 'created_at = created_at', 'updated_at = updated_at'); end if;
      begin
        execute stmt;
        raise exception 'FAIL: anon was allowed: %', stmt;
      exception when insufficient_privilege then null;
      end;
    end loop;
  end loop;
  raise notice 'PASS: anon can''t read or write any table';
end $$;

do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select public.delete_expired_classes()',
    'select public.clear_old_program_code()',
    'select public.pin_try_begin(''aaaaaaaa-0000-0000-0000-0000000057d1'')',
    'select public.pin_try_succeeded(''aaaaaaaa-0000-0000-0000-0000000057d1'')',
    'select public.rate_limit_hit(''x'', 30, 600)',
    'select public.clear_old_rate_limits()',
    'select public.reset_rate_limits()',
    'select public.reset_placement(''aaaaaaaa-0000-0000-0000-000000000001'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''selection'')',
    'select private.my_student_ids()'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: anon can''t run any server function';
end $$;

reset role;

-- ---------- Teacher A ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}', true);

do $$
begin
  if (select count(*) from public.teachers) <> 1 or not exists (select 1 from public.teachers where name = 'Teacher A') then
    raise exception 'FAIL: teacher A should see only their own teachers row';
  end if;
  if (select array_agg(name) from public.classes) is distinct from array['Class A'] then
    raise exception 'FAIL: teacher A should see only class A';
  end if;
  if (select array_agg(nickname) from (select nickname from public.students) s) is distinct from array['Student A'] then
    raise exception 'FAIL: teacher A should see only student A';
  end if;
  if exists (select 1 from public.progress where student_id <> 'aaaaaaaa-0000-0000-0000-0000000057d1')
     or exists (select 1 from public.passed_tasks where student_id <> 'aaaaaaaa-0000-0000-0000-0000000057d1')
     or exists (select 1 from public.attempts where student_id <> 'aaaaaaaa-0000-0000-0000-0000000057d1')
     or exists (select 1 from public.events where student_id <> 'aaaaaaaa-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: teacher A can see teacher B''s student data';
  end if;
  if (select count(*) from public.progress) <> 1 or (select count(*) from public.attempts) <> 1 then
    raise exception 'FAIL: teacher A should see their own student''s progress and attempts';
  end if;
  if exists (select 1 from public.code_reveals) then
    raise exception 'FAIL: teacher A can see teacher B''s code reveals';
  end if;
  raise notice 'PASS: teacher A sees only their own teachers row, class, students and student data';
end $$;

do $$
declare
  n int;
begin
  update public.classes set name = 'Taken over' where id = 'bbbbbbbb-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A renamed class B'; end if;
  update public.students set nickname = 'Renamed' where id = 'bbbbbbbb-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A renamed student B'; end if;
  delete from public.students where id = 'bbbbbbbb-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A deleted student B'; end if;
  delete from public.classes where id = 'bbbbbbbb-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A deleted class B'; end if;
  delete from public.attempts where student_id = 'bbbbbbbb-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A deleted student B''s attempts'; end if;
  raise notice 'PASS: teacher A can''t change or delete teacher B''s classes, students or data';
end $$;

do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    -- a class for someone else
    'insert into public.classes (name, teacher_id) values (''Fake'', ''bbbbbbbb-0000-0000-0000-000000000001'')',
    -- a teachers row for someone else
    'insert into public.teachers (id, name) values (''cccccccc-0000-0000-0000-000000000001'', ''Not me'')',
    -- students are only added by the Edge Functions
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''New One'', ''x'', ''x'', ''x'')',
    -- secrets in the students table
    'select pin_hash from public.students',
    'select login_lookup from public.students',
    'select login_code_enc from public.students',
    -- columns a teacher may not set
    'update public.classes set class_code = ''ABCDEF''',
    'update public.students set failed_pins = 0, locked_until = null',
    'update public.students set class_id = ''bbbbbbbb-0000-0000-0000-00000000c1a5''',
    -- student data is only written by the Edge Functions
    'insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values (''a-x'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''attempt'', now(), ''selection'', ''if-L3a'', ''pass'')',
    'update public.attempts set result = ''pass''',
    'update public.progress set state = ''{}''',
    'insert into public.passed_tasks (student_id, unit, fingerprint) values (''aaaaaaaa-0000-0000-0000-0000000057d1'', ''selection'', ''x'')',
    'update public.events set unit = ''maths''',
    'insert into public.code_reveals (teacher_id, class_id, student_id) values (''aaaaaaaa-0000-0000-0000-000000000001'', ''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''aaaaaaaa-0000-0000-0000-0000000057d1'')',
    -- server functions
    'select public.reset_placement(''aaaaaaaa-0000-0000-0000-000000000001'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''selection'')',
    'select public.pin_try_succeeded(''bbbbbbbb-0000-0000-0000-0000000057d1'')',
    'select public.delete_expired_classes()'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: teacher A was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: teacher A can''t add classes or teachers rows for others, add students, read login secrets, or write student data';
end $$;

-- ---------- Events a teacher may insert ----------
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    -- another teacher's student, even for the allowed record types
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit) values (''p-x1'', ''bbbbbbbb-0000-0000-0000-0000000057d1'', ''placement_reset'', now(), ''selection'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_after, level_change_reason) values (''l-x1'', ''bbbbbbbb-0000-0000-0000-0000000057d1'', ''level_change'', now(), ''selection'', 7, ''test-mode'')',
    -- own student, but a record type or reason only the app writes
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_after, level_change_reason) values (''l-x2'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''level_change'', now(), ''selection'', 7, ''passes'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, button) values (''b-x1'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''button_use'', now(), ''selection'', ''too-easy'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, placement_results) values (''p-x2'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''placement_result'', now(), ''selection'', ''[]'')'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: teacher A was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;

  insert into public.events (record_id, student_id, record_type, "timestamp", unit)
    values ('p-ok1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'placement_reset', now(), 'selection');
  insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason)
    values ('l-ok1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'level_change', now(), 'selection', 3, 7, 'test-mode');
  raise notice 'PASS: a teacher can''t insert events for another teacher''s students, and only placement_reset and test-mode level changes for their own';
end $$;

-- ---------- What teacher A may do ----------
do $$
declare
  code text;
  n int;
begin
  insert into public.classes (name) values ('Class A2') returning class_code into code;
  if code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then raise exception 'FAIL: bad class code %', code; end if;
  if (select end_of_year from public.classes where name = 'Class A2') <> private.end_of_school_year(current_date) then
    raise exception 'FAIL: new class should end on 31 August of this school year';
  end if;
  update public.classes set name = 'Class A (renamed)', end_of_year = current_date + 10 where id = 'aaaaaaaa-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher A couldn''t update class A'; end if;
  update public.students set nickname = 'Student A2' where id = 'aaaaaaaa-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher A couldn''t rename student A'; end if;
  begin
    update public.students set nickname = 'x' where id = 'aaaaaaaa-0000-0000-0000-0000000057d1';
    raise exception 'FAIL: a 1-character nickname was allowed';
  exception when check_violation then null;
  end;
  delete from public.classes where name = 'Class A2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher A couldn''t delete their own class'; end if;
  raise notice 'PASS: teacher A can create, update and delete their own classes and rename their own students';
end $$;

reset role;

-- ---------- A signed-in user with no teachers row ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-000000000001", "role": "authenticated"}', true);

do $$
declare
  t text;
  n int;
begin
  for t in select name from rls_tables loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'FAIL: a user with no classes can see % rows of %', n, t; end if;
  end loop;
  begin
    insert into public.classes (name) values ('No teacher row');
    raise exception 'FAIL: a class was made without a teachers row';
  exception when foreign_key_violation then null;
  end;
  insert into public.teachers (id, name) values ('cccccccc-0000-0000-0000-000000000001', 'Teacher C');
  raise notice 'PASS: a new user sees nothing, needs a teachers row first, and can add their own';
end $$;

reset role;
rollback;
