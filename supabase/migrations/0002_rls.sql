-- Row-level security. anon has no access to any table. Teachers (Supabase Auth users) reach their own classes'
-- data directly; students never touch the tables (the Edge Functions use the service role, which bypasses RLS).

-- Helpers used by the policies. Security definer, so a policy doesn't run other tables' policies row by row.
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public;
grant execute on function private.valid_nickname(text), private.end_of_school_year(date) to authenticated, service_role;

create function private.my_class_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.classes c where c.teacher_id = auth.uid()
$$;

create function private.my_student_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s join public.classes c on c.id = s.class_id where c.teacher_id = auth.uid()
$$;

grant execute on function private.my_class_ids(), private.my_student_ids() to authenticated;

-- The class code trigger reads every class (to keep codes unique), so it runs as the owner.
alter function private.new_class_code() security definer;
alter function private.set_class_code() security definer;

-- ---------- Privileges ----------
-- Supabase grants everything on new tables to anon and authenticated; take it all back, then grant only what's used.
revoke all on table public.teachers, public.classes, public.students, public.progress, public.passed_tasks,
  public.attempts, public.events, public.code_reveals from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Tables made later by a migration don't get anon access by default either.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

grant select, insert (id, name), update (name) on public.teachers to authenticated;
grant select, delete, insert (name, end_of_year), update (name, end_of_year) on public.classes to authenticated;
-- Not login_lookup, login_code_enc or pin_hash: codes are only shown through teacher-api reveal_codes, and
-- a bcrypt hash of a 4-digit PIN could be cracked in seconds.
grant select (id, class_id, nickname, failed_pins, locked_until, imported, created_at), update (nickname), delete
  on public.students to authenticated;
grant select, delete on public.progress, public.passed_tasks, public.attempts to authenticated;
grant select, delete, insert (record_id, student_id, record_type, "timestamp", unit, task_id, student_level_before,
  student_level_after, level_change_reason, button, placement_start_level, placement_results) on public.events to authenticated;
grant select on public.code_reveals to authenticated;

-- ---------- Policies ----------
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.progress enable row level security;
alter table public.passed_tasks enable row level security;
alter table public.attempts enable row level security;
alter table public.events enable row level security;
alter table public.code_reveals enable row level security;

create policy "teacher reads own row" on public.teachers for select to authenticated
  using (id = (select auth.uid()));
create policy "teacher adds own row" on public.teachers for insert to authenticated
  with check (id = (select auth.uid()));
create policy "teacher updates own row" on public.teachers for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "teacher reads own classes" on public.classes for select to authenticated
  using (teacher_id = (select auth.uid()));
create policy "teacher adds own classes" on public.classes for insert to authenticated
  with check (teacher_id = (select auth.uid()));
create policy "teacher updates own classes" on public.classes for update to authenticated
  using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy "teacher deletes own classes" on public.classes for delete to authenticated
  using (teacher_id = (select auth.uid()));

-- Students are only added by the Edge Functions (join-class, teacher-api import).
create policy "teacher reads own students" on public.students for select to authenticated
  using (class_id in (select private.my_class_ids()));
create policy "teacher updates own students" on public.students for update to authenticated
  using (class_id in (select private.my_class_ids())) with check (class_id in (select private.my_class_ids()));
create policy "teacher deletes own students" on public.students for delete to authenticated
  using (class_id in (select private.my_class_ids()));

create policy "teacher reads own students' progress" on public.progress for select to authenticated
  using (student_id in (select private.my_student_ids()));
create policy "teacher deletes own students' progress" on public.progress for delete to authenticated
  using (student_id in (select private.my_student_ids()));

create policy "teacher reads own students' passed tasks" on public.passed_tasks for select to authenticated
  using (student_id in (select private.my_student_ids()));
create policy "teacher deletes own students' passed tasks" on public.passed_tasks for delete to authenticated
  using (student_id in (select private.my_student_ids()));

create policy "teacher reads own students' attempts" on public.attempts for select to authenticated
  using (student_id in (select private.my_student_ids()));
create policy "teacher deletes own students' attempts" on public.attempts for delete to authenticated
  using (student_id in (select private.my_student_ids()));

create policy "teacher reads own students' events" on public.events for select to authenticated
  using (student_id in (select private.my_student_ids()));
create policy "teacher deletes own students' events" on public.events for delete to authenticated
  using (student_id in (select private.my_student_ids()));
-- A teacher may only add a placement reset or a test-mode level change (the spec's teacher_level_set, which the
-- export records as level_change with reason test-mode or test-mode-completed).
create policy "teacher adds resets and level sets" on public.events for insert to authenticated
  with check (
    student_id in (select private.my_student_ids()) and (
      record_type = 'placement_reset' or
      (record_type = 'level_change' and level_change_reason in ('test-mode', 'test-mode-completed'))
    )
  );

create policy "teacher reads own code reveals" on public.code_reveals for select to authenticated
  using (teacher_id = (select auth.uid()));
