-- Checks for the server functions (0003) and the table constraints (0001), as the service role.
-- Runs in one transaction that is rolled back. Run against the local database: node tests/sql/run.js

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;
begin;

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'teacher-a@example.test');
insert into public.teachers (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Teacher A');
insert into public.classes (id, teacher_id, name, end_of_year) values
  ('aaaaaaaa-0000-0000-0000-00000000c1a5', 'aaaaaaaa-0000-0000-0000-000000000001', 'Current', current_date),
  ('aaaaaaaa-0000-0000-0000-00000000c1a6', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ended', current_date - 1);
insert into public.students (id, class_id, nickname, login_lookup, login_code_enc, pin_hash) values
  ('aaaaaaaa-0000-0000-0000-0000000057d1', 'aaaaaaaa-0000-0000-0000-00000000c1a5', 'Student A', 'lookup-a', 'enc-a', 'hash-a'),
  ('aaaaaaaa-0000-0000-0000-0000000057d2', 'aaaaaaaa-0000-0000-0000-00000000c1a6', 'Old Student', 'lookup-old', 'enc-old', 'hash-old');

set local role service_role;

-- ---------- Constraints ----------
do $$
declare
  stmt text;
begin
  -- class codes are always made by the trigger
  if (select class_code from public.classes where name = 'Current') !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'FAIL: bad class code';
  end if;
  insert into public.classes (teacher_id, name, class_code) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Chosen', 'AAAAAA');
  if (select class_code from public.classes where name = 'Chosen') = 'AAAAAA' then
    raise exception 'FAIL: a chosen class code was kept';
  end if;

  if private.end_of_school_year('2026-11-02') <> '2027-08-31' or private.end_of_school_year('2027-08-31') <> '2027-08-31'
     or private.end_of_school_year('2027-09-01') <> '2028-08-31' then
    raise exception 'FAIL: end_of_school_year';
  end if;

  foreach stmt in array array[
    -- nickname rules
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''student a'', ''l1'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''Z'', ''l2'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', '' Lead'', ''l3'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''Two  Spaces'', ''l4'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''Zoë'', ''l5'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''abcdefghijklmnopqrstu'', ''l6'', ''e'', ''h'')',
    'insert into public.students (class_id, nickname, login_lookup, login_code_enc, pin_hash) values (''aaaaaaaa-0000-0000-0000-00000000c1a5'', ''Fine Name'', ''lookup-a'', ''e'', ''h'')',
    -- export values only
    'insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values (''a-1'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''skip'', now(), ''selection'', ''if-L3a'', ''skip'')',
    'insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values (''a-2'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''attempt'', now(), ''selection'', ''if-L3a'', ''skipped'')',
    'insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result, hint_type) values (''a-3'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''hint'', now(), ''selection'', ''if-L3a'', ''pass'', ''show-me-how'')',
    'insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result) values (''a-4'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''attempt'', now(), ''endless'', ''if-L3a'', ''pass'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit) values (''p-1'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''placement'', now(), ''selection'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit, student_level_after, level_change_reason) values (''l-1'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''level_change'', now(), ''selection'', 4, ''teacher_level_set'')',
    'insert into public.events (record_id, student_id, record_type, "timestamp", unit) values (''l-2'', ''aaaaaaaa-0000-0000-0000-0000000057d1'', ''level_change'', now(), ''selection'')',
    'insert into public.progress (student_id, unit, state) values (''aaaaaaaa-0000-0000-0000-0000000057d1'', ''python'', ''{}'')'
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: was allowed: %', stmt;
    exception when check_violation or unique_violation then null;
    end;
  end loop;

  -- every record_type and result the export uses
  insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result, hint_type) values
    ('a-ok-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L3a', 'pass', null),
    ('a-ok-2', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L3a', 'fail', null),
    ('a-ok-3', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'skip', now(), 'selection', 'if-L3a', 'skipped', null),
    ('a-ok-4', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'hint', now(), 'selection', 'if-L3a', 'show-me-how', 'show-me-how');
  insert into public.events (record_id, student_id, record_type, "timestamp", unit, task_id, student_level_before, student_level_after, level_change_reason, button, placement_start_level, placement_results) values
    ('l-ok-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'level_change', now(), 'selection', null, null, 5, 'placement', null, null, null),
    ('b-ok-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'button_use', now(), 'selection', 'if-L5a', 5, 6, null, 'too-easy', null, null),
    ('p-ok-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'placement_result', now(), 'selection', null, null, null, null, null, 5, '[{"level": 2, "passed": true}]'),
    ('p-ok-2', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'placement_reset', now(), 'selection', null, null, null, null, null, null, null);

  -- the same record sent twice (a retried batch) is refused, so it can't be counted twice
  begin
    insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result)
      values ('a-ok-1', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now(), 'selection', 'if-L3a', 'pass');
    raise exception 'FAIL: a duplicate record_id was stored';
  exception when unique_violation then null;
  end;
  raise notice 'PASS: class codes, nickname rules, export values and duplicate records are enforced';
end $$;

-- ---------- progress reads level, placement and completed from state ----------
do $$
declare
  p public.progress;
begin
  insert into public.progress (student_id, unit, state) values
    ('aaaaaaaa-0000-0000-0000-0000000057d1', 'selection', '{"level": 7, "completedTop": false, "placement": {"status": "done", "startLevel": 5, "used": ["sel-P2a", "sel-P5a"]}, "current": {"taskId": "if-L7a"}}'),
    ('aaaaaaaa-0000-0000-0000-0000000057d1', 'endless', '{"units": ["selection"], "current": null, "last": {}}');
  select * into p from public.progress where unit = 'selection';
  if p.level <> 7 or p.completed or p.placement ->> 'startLevel' <> '5' then raise exception 'FAIL: derived progress columns'; end if;
  update public.progress set state = jsonb_set(state::jsonb, '{completedTop}', 'true')::json where unit = 'selection';
  if not (select completed from public.progress where unit = 'selection') then raise exception 'FAIL: completed not updated'; end if;
  if (select level from public.progress where unit = 'endless') is not null then raise exception 'FAIL: endless has no level'; end if;
  raise notice 'PASS: progress keeps the whole unit state and reads level, placement and completed from it';
end $$;

-- ---------- Reset placement ----------
do $$
declare
  st json;
begin
  if public.reset_placement('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'selection') then
    raise exception 'FAIL: another teacher reset the placement';
  end if;
  if public.reset_placement('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'maths') then
    raise exception 'FAIL: reset a unit that was never started';
  end if;
  if not public.reset_placement('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'selection') then
    raise exception 'FAIL: reset_placement returned false';
  end if;
  select state into st from public.progress where student_id = 'aaaaaaaa-0000-0000-0000-0000000057d1' and unit = 'selection';
  if (st -> 'placement')::jsonb <> '{"status": "pending", "taskIds": [], "step": 0, "results": [], "startLevel": null, "used": ["sel-P2a", "sel-P5a"]}'::jsonb
     or (st -> 'current')::jsonb <> 'null'::jsonb or (st ->> 'level')::int <> 7 then
    raise exception 'FAIL: reset_placement state: %', st;
  end if;
  if (select count(*) from public.events where record_type = 'placement_reset' and record_id like 'p-%'
      and student_id = 'aaaaaaaa-0000-0000-0000-0000000057d1' and unit = 'selection') <> 2 then
    raise exception 'FAIL: reset_placement didn''t write one placement_reset event';
  end if;
  raise notice 'PASS: reset_placement does what app.js resetPlacement does, for the teacher''s own students only, and logs it';
end $$;

-- ---------- PIN lock ----------
do $$
declare
  r record;
  i int;
  sid constant uuid := 'aaaaaaaa-0000-0000-0000-0000000057d1';
begin
  for i in 1..4 loop
    select * into r from public.pin_try_begin(sid);
    if not r.allowed then raise exception 'FAIL: try % refused', i; end if;
  end loop;
  if (select failed_pins from public.students where id = sid) <> 4 then raise exception 'FAIL: 4 tries not counted'; end if;
  select * into r from public.pin_try_begin(sid);   -- the 5th try is still checked, and locks the account
  if not r.allowed or r.locked_until <> now() + interval '15 minutes' then raise exception 'FAIL: 5th try refused or didn''t report the lock'; end if;
  if (select failed_pins from public.students where id = sid) <> 0
     or (select locked_until from public.students where id = sid) <> now() + interval '15 minutes' then
    raise exception 'FAIL: 5 wrong PINs should lock for 15 minutes and reset the count';
  end if;
  select * into r from public.pin_try_begin(sid);   -- locked: refused before the PIN is even compared
  if r.allowed or r.locked_until <> now() + interval '15 minutes' then raise exception 'FAIL: a locked account allowed a try'; end if;

  -- after the lock expires, a right PIN works and clears everything
  update public.students set locked_until = now() - interval '1 second' where id = sid;
  select * into r from public.pin_try_begin(sid);
  if not r.allowed then raise exception 'FAIL: try refused after the lock expired'; end if;
  perform public.pin_try_succeeded(sid);
  if (select failed_pins from public.students where id = sid) <> 0 or (select locked_until from public.students where id = sid) is not null then
    raise exception 'FAIL: a right PIN should clear the count';
  end if;

  select * into r from public.pin_try_begin('00000000-0000-0000-0000-000000000000');
  if r.allowed then raise exception 'FAIL: unknown student allowed'; end if;
  raise notice 'PASS: 5 wrong PINs lock the account for 15 minutes; tries are refused while locked; a right PIN after it clears it';
end $$;

-- ---------- Rate limit ----------
do $$
declare
  i int;
begin
  for i in 1..30 loop
    if not public.rate_limit_hit('ip-test', 30, 600) then raise exception 'FAIL: request % refused', i; end if;
  end loop;
  if public.rate_limit_hit('ip-test', 30, 600) then raise exception 'FAIL: 31st request allowed'; end if;
  if not public.rate_limit_hit('ip-other', 30, 600) then raise exception 'FAIL: another IP refused'; end if;
  raise notice 'PASS: the rate limit allows 30 requests per window per key';
end $$;

-- ---------- Retention ----------
do $$
declare
  a public.attempts;
  n int;
begin
  insert into public.attempts (record_id, student_id, record_type, "timestamp", unit, task_id, result, failure_category,
      failure_details, misconception_matches, student_code, student_output, code_hash, created_at) values
    ('a-old', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now() - interval '31 days', 'selection', 'if-L3a', 'fail',
      'WRONG_OUTPUT', '{"test": 1}', '{assign-vs-compare}', 'print(1)', '1', 'hash-old', now() - interval '31 days'),
    ('a-new', 'aaaaaaaa-0000-0000-0000-0000000057d1', 'attempt', now() - interval '29 days', 'selection', 'if-L3a', 'fail',
      'WRONG_OUTPUT', '{"test": 1}', '{assign-vs-compare}', 'print(2)', '2', 'hash-new', now() - interval '29 days');
  n := public.clear_old_program_code();
  if n <> 1 then raise exception 'FAIL: cleared % attempts, expected 1', n; end if;
  select * into a from public.attempts where record_id = 'a-old';
  if a.student_code is not null or a.student_output is not null or a.code_deleted_at is null then
    raise exception 'FAIL: old code and output not cleared';
  end if;
  if a.code_hash <> 'hash-old' or a.failure_category <> 'WRONG_OUTPUT' or a.failure_details::jsonb <> '{"test": 1}'
     or a.misconception_matches <> '{assign-vs-compare}' then
    raise exception 'FAIL: retention removed the hash, category, details or matches';
  end if;
  if (select student_code from public.attempts where record_id = 'a-new') <> 'print(2)' then
    raise exception 'FAIL: code younger than 30 days was cleared';
  end if;

  n := public.delete_expired_classes();
  if n <> 1 or exists (select 1 from public.classes where name = 'Ended')
     or exists (select 1 from public.students where nickname = 'Old Student') then
    raise exception 'FAIL: expired class or its students not deleted';
  end if;
  if not exists (select 1 from public.classes where name = 'Current') then
    raise exception 'FAIL: a class ending today was deleted';
  end if;
  raise notice 'PASS: code and output are cleared after 30 days (hash, category, details and matches kept); expired classes are deleted';
end $$;

-- ---------- Deleting a class removes everything ----------
do $$
begin
  delete from public.classes where id = 'aaaaaaaa-0000-0000-0000-00000000c1a5';
  if exists (select 1 from public.students) or exists (select 1 from public.progress) or exists (select 1 from public.attempts)
     or exists (select 1 from public.events) then
    raise exception 'FAIL: deleting a class left student data behind';
  end if;
  raise notice 'PASS: deleting a class removes its students, progress, attempts and events';
end $$;

reset role;

-- ---------- Nightly jobs ----------
do $$
begin
  if (select count(*) from cron.job where jobname in ('clear-old-program-code', 'delete-expired-classes', 'clear-old-rate-limits')
      and schedule ~ '^\d+ 2 \* \* \*$') <> 3 then
    raise exception 'FAIL: the three nightly jobs aren''t scheduled';
  end if;
  raise notice 'PASS: the three nightly jobs are scheduled';
end $$;

rollback;
