-- Certificates (migration 0017): who can read the certificates table. Runs in one transaction that is rolled back,
-- so it leaves nothing behind. Each check raises an error if it fails; with ON_ERROR_STOP, psql then exits non-zero.
-- Run against the local database, once 0016 and 0017 are applied there: node tests/sql/run.js certificates.sql
--
-- The checks:
--   1. A teacher sees the certificates of the students in their class (as owner, and as co-teacher).
--   2. A teacher outside the class sees none of them.
--   3. No teacher can add, change or delete a certificate (only the server writes the table).
--   4. anon (and so a student, whose requests are anon until student-api) can't read or write it.
--   5. One certificate per student per block; a certificate goes with its student.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

-- ---------- Fixtures (as postgres) ----------
-- Teacher P owns class P (student P1, with two certificates), shared with co-teacher Q. Teacher R has class R
-- (student R1, one certificate) and no membership of class P.
insert into auth.users (id, email) values
  ('0000000f-0000-0000-0000-000000000001', 'cert-p@example.test'),
  ('0000000f-0000-0000-0000-000000000002', 'cert-q@example.test'),
  ('0000000f-0000-0000-0000-000000000003', 'cert-r@example.test');
insert into public.teachers (id, name) values
  ('0000000f-0000-0000-0000-000000000001', 'Teacher P'),
  ('0000000f-0000-0000-0000-000000000002', 'Teacher Q'),
  ('0000000f-0000-0000-0000-000000000003', 'Teacher R');
insert into public.classes (id, teacher_id, name) values
  ('0000000f-0000-0000-0000-00000000c1a1', '0000000f-0000-0000-0000-000000000001', 'Class P'),
  ('0000000f-0000-0000-0000-00000000c1a3', '0000000f-0000-0000-0000-000000000003', 'Class R');
insert into public.class_teachers (class_id, teacher_id, added_by) values
  ('0000000f-0000-0000-0000-00000000c1a1', '0000000f-0000-0000-0000-000000000002', '0000000f-0000-0000-0000-000000000001');
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('0000000f-0000-0000-0000-0000000057d1', '0000000f-0000-0000-0000-00000000c1a1', 'Student P1', 'cert-lookup-p1', 'enc', 'hash'),
  ('0000000f-0000-0000-0000-0000000057d3', '0000000f-0000-0000-0000-00000000c1a3', 'Student R1', 'cert-lookup-r1', 'enc', 'hash');
-- As teacher-api saves them (service role).
insert into public.certificates (student_id, block_id, block_name, earned_on) values
  ('0000000f-0000-0000-0000-0000000057d1', 'fundamentals', 'Programming fundamentals', '2026-10-23'),
  ('0000000f-0000-0000-0000-0000000057d1', 'searching-sorting', 'Searching and sorting', '2026-11-02'),
  ('0000000f-0000-0000-0000-0000000057d3', 'fundamentals', 'Programming fundamentals', '2026-11-10');

-- 5. One certificate per student per block, and only the six blocks.
do $$
begin
  begin
    insert into public.certificates (student_id, block_id, block_name, earned_on)
      values ('0000000f-0000-0000-0000-0000000057d1', 'fundamentals', 'Programming fundamentals', '2026-11-18');
    raise exception 'FAIL: a second certificate for the same student and block was saved';
  exception when unique_violation then null;
  end;
  begin
    insert into public.certificates (student_id, block_id, block_name, earned_on)
      values ('0000000f-0000-0000-0000-0000000057d1', 'not-a-block', 'Nothing', '2026-11-18');
    raise exception 'FAIL: a certificate for an unknown block was saved';
  exception when check_violation then null;
  end;
  raise notice 'PASS: one certificate per student per block, for the six blocks only';
end $$;

-- ---------- 1. Owner P sees their student's certificates, and no other ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "0000000f-0000-0000-0000-000000000001", "role": "authenticated"}', true);
do $$
begin
  if (select array_agg(block_id order by block_id) from public.certificates) is distinct from array['fundamentals', 'searching-sorting'] then
    raise exception 'FAIL: teacher P should see student P1''s two certificates and nothing else';
  end if;
  raise notice 'PASS: a teacher sees the certificates of the students in their class';
end $$;

-- ---------- 1. Co-teacher Q sees the same ----------
select set_config('request.jwt.claims', '{"sub": "0000000f-0000-0000-0000-000000000002", "role": "authenticated"}', true);
do $$
begin
  if (select array_agg(block_id order by block_id) from public.certificates) is distinct from array['fundamentals', 'searching-sorting'] then
    raise exception 'FAIL: co-teacher Q should see student P1''s two certificates and nothing else';
  end if;
  raise notice 'PASS: a co-teacher sees the same certificates as the owner';
end $$;

-- ---------- 2 and 3. Teacher R (outside class P) sees none of class P's; no teacher writes the table ----------
select set_config('request.jwt.claims', '{"sub": "0000000f-0000-0000-0000-000000000003", "role": "authenticated"}', true);
do $$
declare
  stmt text;
begin
  if exists (select 1 from public.certificates where student_id = '0000000f-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: teacher R can see a certificate of class P''s student';
  end if;
  if (select count(*) from public.certificates) <> 1 then
    raise exception 'FAIL: teacher R should see only their own student''s certificate';
  end if;
  foreach stmt in array array[
    'insert into public.certificates (student_id, block_id, block_name, earned_on) values (''0000000f-0000-0000-0000-0000000057d3'', ''advanced'', ''Advanced programming'', ''2026-11-18'')',
    'update public.certificates set earned_on = ''2020-01-01''',
    'delete from public.certificates'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: a teacher was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: a teacher outside the class sees none of its certificates, and no teacher can add, change or delete one';
end $$;

-- ---------- 4. anon can't read or write the table ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'select count(*) from public.certificates',
    'insert into public.certificates default values',
    'delete from public.certificates'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anon was allowed: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'PASS: anon (and so a student) can''t read or write certificates';
end $$;

-- ---------- 5. A certificate goes with its student ----------
reset role;
delete from public.students where id = '0000000f-0000-0000-0000-0000000057d1';
do $$
begin
  if exists (select 1 from public.certificates where student_id = '0000000f-0000-0000-0000-0000000057d1') then
    raise exception 'FAIL: a deleted student''s certificates were kept';
  end if;
  raise notice 'PASS: a student''s certificates are deleted with them';
end $$;

reset role;
rollback;
