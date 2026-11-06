-- Class assignments (migration 0005): row-level security, checks, and attempts that name an assignment.
-- Runs in one transaction that is rolled back, so it leaves nothing behind. Each check raises an error if it fails.
-- Run against the local database: node tests/sql/run.js assignments.sql

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher A has class A with student A; teacher B has class B with student B, and an assignment.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'as-teacher-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'as-teacher-b@example.test');
insert into public.teachers (id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Teacher A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Teacher B');
insert into public.classes (id, teacher_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Class A'),
  ('bbbbbbbb-0000-0000-0000-0000000bc1a5', 'bbbbbbbb-0000-0000-0000-0000000000b1', 'Class B');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-000000a057d1', 'aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Student A', 'as-lookup-a', 'enc-a', 'hash-a'),
  ('bbbbbbbb-0000-0000-0000-000000b057d1', 'bbbbbbbb-0000-0000-0000-0000000bc1a5', 'Student B', 'as-lookup-b', 'enc-b', 'hash-b');
insert into public.assignments (id, class_id, title, task_ids) values
  ('bbbbbbbb-0000-0000-0000-0000000a551b', 'bbbbbbbb-0000-0000-0000-0000000bc1a5', 'B''s homework', array['var-L9c', 'maths-L4a']);

-- ---------- anon: nothing ----------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
declare stmt text;
begin
  foreach stmt in array array[
    'select count(*) from public.assignments',
    'insert into public.assignments (class_id, title, task_ids) values (''bbbbbbbb-0000-0000-0000-0000000bc1a5'', ''x'', array[''var-L1a''])',
    'update public.assignments set title = title',
    'delete from public.assignments'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: anon can''t read or write assignments';
end $$;
reset role;

-- ---------- Teacher A: only their own class's assignments ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
do $$
declare
  n int;
  aid uuid;
begin
  select count(*) into n from public.assignments;
  if n <> 0 then raise exception 'FAIL: teacher A can see % assignments of another class', n; end if;

  insert into public.assignments (class_id, title, description, task_ids)
    values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Week 3', 'Commas and casting', array['out-L1e', 'var-L2e', 'var-L9c'])
    returning id into aid;
  select count(*) into n from public.assignments where id = aid and status = 'open';
  if n <> 1 then raise exception 'FAIL: a new assignment should be open and visible to its teacher'; end if;

  update public.assignments set status = 'closed', task_ids = array['var-L9c'], title = 'Week 3 (changed)' where id = aid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher A couldn''t change or close their own assignment'; end if;

  begin
    insert into public.assignments (class_id, title, task_ids) values ('bbbbbbbb-0000-0000-0000-0000000bc1a5', 'Not mine', array['var-L1a']);
    raise exception 'FAIL: teacher A made an assignment for teacher B''s class';
  exception when insufficient_privilege then null;
  end;

  update public.assignments set title = 'Hacked' where id = 'bbbbbbbb-0000-0000-0000-0000000a551b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A changed teacher B''s assignment'; end if;
  delete from public.assignments where id = 'bbbbbbbb-0000-0000-0000-0000000a551b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher A deleted teacher B''s assignment'; end if;

  begin
    update public.assignments set class_id = 'bbbbbbbb-0000-0000-0000-0000000bc1a5' where id = aid;
    raise exception 'FAIL: an assignment was moved to another class';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: a teacher can create, change and close only their own classes'' assignments';
end $$;

-- The table's checks.
do $$
begin
  begin
    insert into public.assignments (class_id, title, task_ids) values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Empty', array[]::text[]);
    raise exception 'FAIL: an assignment with no tasks was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.assignments (class_id, title, task_ids) values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Bad id', array['var-L9c; drop table x']);
    raise exception 'FAIL: a task id with spaces and punctuation was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.assignments (class_id, title, task_ids, status) values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Odd', array['var-L9c'], 'draft');
    raise exception 'FAIL: a status other than open or closed was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.assignments (class_id, title, task_ids) values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', '  ', array['var-L9c']);
    raise exception 'FAIL: a blank title was allowed';
  exception when check_violation then null;
  end;
  raise notice 'PASS: an assignment needs a title, 1 to 50 valid task ids and a status of open or closed';
end $$;
reset role;

-- Teacher B sees their assignment, and a student's attempts on it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "bbbbbbbb-0000-0000-0000-0000000000b1", "role": "authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.assignments;
  if n <> 1 then raise exception 'FAIL: teacher B should see only their 1 assignment (sees %)', n; end if;
  raise notice 'PASS: each teacher sees only their own assignments';
end $$;
reset role;

-- ---------- Attempts on an assignment (as the Edge Functions write them) ----------
do $$
declare n int;
begin
  insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, phase, result, assignment_id)
    values ('a-as-1', 'bbbbbbbb-0000-0000-0000-000000b057d1', 'attempt', now(), 'variables', 'var-L9c', 'assignment', 'fail',
            'bbbbbbbb-0000-0000-0000-0000000a551b');
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, phase, result, assignment_id)
      values ('a-as-2', 'aaaaaaaa-0000-0000-0000-000000a057d1', 'attempt', now(), 'variables', 'var-L9c', 'assignment', 'fail',
              'bbbbbbbb-0000-0000-0000-0000000a551b');
    raise exception 'FAIL: a student saved an attempt on another class''s assignment';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, phase, result, assignment_id)
      values ('a-as-3', 'bbbbbbbb-0000-0000-0000-000000b057d1', 'attempt', now(), 'variables', 'var-L9c', 'practice', 'fail',
              'bbbbbbbb-0000-0000-0000-0000000a551b');
    raise exception 'FAIL: a practice attempt named an assignment';
  exception when check_violation then null;
  end;
  -- Closing the assignment keeps its attempts; deleting it keeps them too, without the id.
  update public.assignments set status = 'closed' where id = 'bbbbbbbb-0000-0000-0000-0000000a551b';
  select count(*) into n from public.attempts where assignment_id = 'bbbbbbbb-0000-0000-0000-0000000a551b';
  if n <> 1 then raise exception 'FAIL: closing an assignment should keep its attempts'; end if;
  delete from public.assignments where id = 'bbbbbbbb-0000-0000-0000-0000000a551b';
  select count(*) into n from public.attempts where record_id = 'a-as-1' and assignment_id is null and phase = 'assignment';
  if n <> 1 then raise exception 'FAIL: deleting an assignment should keep its attempts, without the id'; end if;
  raise notice 'PASS: an attempt can only name an assignment of the student''s own class, and only in phase assignment';
end $$;

-- Deleting a class deletes its assignments.
do $$
declare n int;
begin
  insert into public.assignments (class_id, title, task_ids) values ('aaaaaaaa-0000-0000-0000-0000000ac1a5', 'Gone soon', array['var-L1a']);
  delete from public.classes where id = 'aaaaaaaa-0000-0000-0000-0000000ac1a5';
  select count(*) into n from public.assignments where class_id = 'aaaaaaaa-0000-0000-0000-0000000ac1a5';
  if n <> 0 then raise exception 'FAIL: a deleted class left % assignments behind', n; end if;
  raise notice 'PASS: deleting a class (or its end date passing) deletes its assignments';
end $$;

rollback;
