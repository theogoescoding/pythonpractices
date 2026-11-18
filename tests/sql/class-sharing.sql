-- Class sharing (migration 0016): what a co-teacher can and can't see and do. Runs in one transaction that is rolled
-- back, so it leaves nothing behind. Each check raises an error if it fails; with ON_ERROR_STOP, psql then exits
-- non-zero. Run against the local database, once 0016 is applied there: node tests/sql/run.js class-sharing.sql
--
-- The checks:
--   1. Every class has a class_teachers row for its owner (existing classes by the backfill, new ones by the trigger).
--   2. A co-teacher sees the shared class, its students and all their data, its assignments, its code reveals, the
--      class's teacher list and the owner's name.
--   3. A co-teacher has the owner's rights: renames the class and changes its stage, renames and removes students,
--      adds and deletes assignments, and resets a placement (reset_placement).
--   4. A co-teacher can't delete the class (owner only).
--   5. A teacher with no membership sees nothing of the class: not the class, its students, their data, its
--      assignments, its teacher list or the owner's name, and can't change or delete any of it.
--   6. No teacher can add or remove class_teachers rows directly: not a co-teacher (so a co-teacher can't remove the
--      owner, or add themselves to another class), and not the owner either. Adding and removing go through
--      teacher-api (service role), where only the owner may do it and the owner can't be removed
--      (supabase/functions/_shared/class-sharing.js, checked in tests/backend-client.js).
--   7. The two new server functions (teacher_by_email, class_teacher_list) are for the service role only.
--   8. A removed co-teacher loses access straight away.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Owner O has "Shared class" (shared with co-teacher K below) with students S and T. Stranger X has only their own
-- class X, with student X, and no membership of the shared class.
insert into auth.users (id, email) values
  ('0000000a-0000-0000-0000-000000000001', 'owner-o@example.test'),
  ('0000000b-0000-0000-0000-000000000001', 'coteacher-k@example.test'),
  ('0000000c-0000-0000-0000-000000000001', 'stranger-x@example.test');
insert into public.teachers (id, name) values
  ('0000000a-0000-0000-0000-000000000001', 'Owner O'),
  ('0000000b-0000-0000-0000-000000000001', 'Co-teacher K'),
  ('0000000c-0000-0000-0000-000000000001', 'Stranger X');
insert into public.classes (id, teacher_id, name) values
  ('0000000a-0000-0000-0000-00000000c1a5', '0000000a-0000-0000-0000-000000000001', 'Shared class'),
  ('0000000c-0000-0000-0000-00000000c1a5', '0000000c-0000-0000-0000-000000000001', 'Class X');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('0000000a-0000-0000-0000-0000000057d1', '0000000a-0000-0000-0000-00000000c1a5', 'Student S', 'share-lookup-s', 'enc', 'hash'),
  ('0000000a-0000-0000-0000-0000000057d2', '0000000a-0000-0000-0000-00000000c1a5', 'Student T', 'share-lookup-t', 'enc', 'hash'),
  ('0000000c-0000-0000-0000-0000000057d1', '0000000c-0000-0000-0000-00000000c1a5', 'Student X', 'share-lookup-x', 'enc', 'hash');
insert into public.progress (student_id, unit, state) values
  ('0000000a-0000-0000-0000-0000000057d1', 'selection', '{"level": 3, "placement": {"status": "done", "used": []}}');
insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values
  ('a-share-1', '0000000a-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L3a', 'pass');
insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_before, student_level_after, level_change_reason) values
  ('l-share-1', '0000000a-0000-0000-0000-0000000057d1', 'level_change', now(), 'selection', 2, 3, 'passes');
insert into public.assignments (id, class_id, title, task_ids) values
  ('0000000a-0000-0000-0000-0000000a5519', '0000000a-0000-0000-0000-00000000c1a5', 'Homework 1', array['if-L3a']);
insert into public.code_reveals (teacher_id, class_id, student_id) values
  ('0000000a-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-00000000c1a5', '0000000a-0000-0000-0000-0000000057d1');

-- 1. The trigger gave both new classes an owner row; then the owner shares class S with K (as teacher-api would).
do $$
begin
  if (select count(*) from public.class_teachers where class_id = '0000000a-0000-0000-0000-00000000c1a5'
        and teacher_id = '0000000a-0000-0000-0000-000000000001') <> 1
     or (select count(*) from public.class_teachers where class_id = '0000000c-0000-0000-0000-00000000c1a5'
        and teacher_id = '0000000c-0000-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL: a new class should get a class_teachers row for its owner';
  end if;
  if exists (select 1 from public.classes c where not exists (
       select 1 from public.class_teachers ct where ct.class_id = c.id and ct.teacher_id = c.teacher_id)) then
    raise exception 'FAIL: every class should have a class_teachers row for its owner (the backfill)';
  end if;
  raise notice 'PASS: every class has a class_teachers row for its owner';
end $$;
insert into public.class_teachers (class_id, teacher_id, added_by) values
  ('0000000a-0000-0000-0000-00000000c1a5', '0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-000000000001');

-- 7. The new server functions are for the service role only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000000b-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select * from public.teacher_by_email(''owner-o@example.test'')',
    'select * from public.class_teacher_list(''0000000a-0000-0000-0000-00000000c1a5'')'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: a teacher was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: teacher_by_email and class_teacher_list are for the service role only';
end $$;

-- ---------- 2. Co-teacher K sees the shared class and everything in it ----------
do $$
begin
  if (select array_agg(name) from public.classes) is distinct from array['Shared class'] then
    raise exception 'FAIL: co-teacher K should see the shared class (and only it)';
  end if;
  if (select array_agg(nickname order by nickname) from public.students) is distinct from array['Student S', 'Student T'] then
    raise exception 'FAIL: co-teacher K should see the shared class''s students';
  end if;
  if (select count(*) from public.progress) <> 1 or (select count(*) from public.attempts) <> 1 or (select count(*) from public.events) <> 1 then
    raise exception 'FAIL: co-teacher K should see the students'' progress, attempts and events';
  end if;
  if (select array_agg(title) from public.assignments) is distinct from array['Homework 1'] then
    raise exception 'FAIL: co-teacher K should see the shared class''s assignments';
  end if;
  if (select count(*) from public.code_reveals) <> 1 then
    raise exception 'FAIL: co-teacher K should see the owner''s code reveals for the shared class';
  end if;
  if (select count(*) from public.class_teachers) <> 2 then
    raise exception 'FAIL: co-teacher K should see the shared class''s two teachers';
  end if;
  if (select array_agg(name order by name) from public.teachers) is distinct from array['Co-teacher K', 'Owner O'] then
    raise exception 'FAIL: co-teacher K should see their own name and the owner''s (and no one else''s)';
  end if;
  if private.is_class_teacher('0000000a-0000-0000-0000-00000000c1a5') is not true
     or private.is_class_teacher('0000000c-0000-0000-0000-00000000c1a5') is not false then
    raise exception 'FAIL: is_class_teacher should be true for the shared class only';
  end if;
  raise notice 'PASS: a co-teacher sees the shared class, its students and their data, its assignments, its code reveals, its teachers and the owner''s name';
end $$;

-- ---------- 3 and 4. Co-teacher K has the owner's rights, except deleting the class ----------
do $$
declare
  n int;
begin
  update public.classes set name = 'Shared class 2', stage = 'a-level' where id = '0000000a-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: co-teacher K should be able to rename the class and change its stage'; end if;
  update public.students set nickname = 'Student S2' where id = '0000000a-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: co-teacher K should be able to rename a student'; end if;
  delete from public.students where id = '0000000a-0000-0000-0000-0000000057d2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: co-teacher K should be able to remove a student'; end if;
  insert into public.assignments (class_id, title, task_ids) values ('0000000a-0000-0000-0000-00000000c1a5', 'Homework 2', array['if-L4a']);
  delete from public.assignments where class_id = '0000000a-0000-0000-0000-00000000c1a5' and title = 'Homework 2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: co-teacher K should be able to add and delete an assignment'; end if;
  delete from public.classes where id = '0000000a-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: co-teacher K deleted the class (only its owner may)'; end if;
  raise notice 'PASS: a co-teacher renames the class, changes its stage, renames and removes students and sets assignments, but can''t delete the class';
end $$;

-- ---------- 6. No teacher writes class_teachers directly (so a co-teacher can't remove the owner) ----------
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'delete from public.class_teachers where teacher_id = ''0000000a-0000-0000-0000-000000000001''',
    'delete from public.class_teachers where teacher_id = ''0000000b-0000-0000-0000-000000000001''',
    'insert into public.class_teachers (class_id, teacher_id) values (''0000000c-0000-0000-0000-00000000c1a5'', ''0000000b-0000-0000-0000-000000000001'')',
    'update public.class_teachers set teacher_id = teacher_id'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: co-teacher K was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: a co-teacher can''t remove the owner (or anyone), or add themselves to another class';
end $$;

reset role;
-- reset_placement as teacher-api calls it (service role), for the co-teacher: allowed. For the stranger: refused.
do $$
begin
  if public.reset_placement('0000000b-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000057d1', 'selection') is not true then
    raise exception 'FAIL: reset_placement should work for a co-teacher';
  end if;
  if public.reset_placement('0000000c-0000-0000-0000-000000000001', '0000000a-0000-0000-0000-0000000057d1', 'selection') is not false then
    raise exception 'FAIL: reset_placement should refuse a teacher who isn''t on the class';
  end if;
  raise notice 'PASS: reset_placement works for a co-teacher and refuses a stranger';
end $$;

-- The owner can't write class_teachers directly either: removing a co-teacher goes through teacher-api, owner only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000000a-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
begin
  begin
    delete from public.class_teachers where teacher_id = '0000000b-0000-0000-0000-000000000001';
    raise exception 'FAIL: the owner deleted a class_teachers row directly';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.class_teachers) <> 2 then
    raise exception 'FAIL: the owner should see their class''s two teachers';
  end if;
  raise notice 'PASS: only teacher-api adds and removes co-teachers (the owner sees the list but can''t write it directly)';
end $$;

-- ---------- 5. Stranger X (no membership) sees nothing of the shared class ----------
select set_config('request.jwt.claims', '{"sub": "0000000c-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
declare
  n int;
begin
  if (select array_agg(name) from public.classes) is distinct from array['Class X'] then
    raise exception 'FAIL: stranger X should see only their own class';
  end if;
  if (select array_agg(nickname) from public.students) is distinct from array['Student X'] then
    raise exception 'FAIL: stranger X should see only their own student';
  end if;
  if exists (select 1 from public.progress) or exists (select 1 from public.attempts) or exists (select 1 from public.events)
     or exists (select 1 from public.assignments) or exists (select 1 from public.code_reveals) then
    raise exception 'FAIL: stranger X can see the shared class''s data';
  end if;
  if exists (select 1 from public.class_teachers where class_id = '0000000a-0000-0000-0000-00000000c1a5') then
    raise exception 'FAIL: stranger X can see the shared class''s teachers';
  end if;
  if (select array_agg(name) from public.teachers) is distinct from array['Stranger X'] then
    raise exception 'FAIL: stranger X should see only their own name';
  end if;
  update public.classes set name = 'Taken over' where id = '0000000a-0000-0000-0000-00000000c1a5';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger X renamed the shared class'; end if;
  delete from public.students where id = '0000000a-0000-0000-0000-0000000057d1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger X removed a student of the shared class'; end if;
  raise notice 'PASS: a teacher with no membership sees nothing of the class and can''t change it';
end $$;

-- ---------- 8. Removed: co-teacher K loses access straight away ----------
reset role;
delete from public.class_teachers where class_id = '0000000a-0000-0000-0000-00000000c1a5' and teacher_id = '0000000b-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000000b-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
begin
  if exists (select 1 from public.classes) or exists (select 1 from public.students) or exists (select 1 from public.assignments)
     or exists (select 1 from public.class_teachers) then
    raise exception 'FAIL: a removed co-teacher can still see the class';
  end if;
  raise notice 'PASS: a removed co-teacher loses access straight away';
end $$;

reset role;
rollback;
