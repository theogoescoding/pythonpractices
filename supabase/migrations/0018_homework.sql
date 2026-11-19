-- Homework and the large paste flag.
--   - homework: a teacher on a class (its owner or a co-teacher) sets a number of tasks, a due date and, if they
--     like, some units (none means any unit). A class can have several at once. teacher-api creates, lists and
--     deletes them (create_homework, list_homework, delete_homework) as the service role; row-level security below
--     also lets teachers on the class read, add and delete them directly, and nobody else.
--   - homework_progress: each student's "x of y done" on each homework, worked out by the server (homework.js's rule,
--     through _shared/homework-server.js) whenever a pass or a paste flag arrives, the student's homework is read, or a
--     teacher opens the list or the report. Only the server writes it; teachers on the class can read it.
--   - Students never read either table: student-api sends them the homework of their own class only.
--   - events gains record_type 'paste_flag' (a paste of more than 8 lines into the code editor, paste-flag.js), with
--     an "f-" record id and the task's id. Students send it through student-api add_events, like their other events.
-- One transaction: if any statement fails, nothing changes.

begin;

-- ---------- The paste flag event ----------
alter table public.events drop constraint events_record_type_check;
alter table public.events add constraint events_record_type_check
  check (record_type in ('level_change', 'button_use', 'placement_result', 'placement_reset', 'paste_flag'));
alter table public.events drop constraint events_record_id_check;
alter table public.events add constraint events_record_id_check check (record_id ~ '^[lbpf]-[a-z0-9-]{1,40}$');
alter table public.events add constraint events_paste_flag_task check (record_type <> 'paste_flag' or task_id is not null);
create index events_paste_flags on public.events (student_id) where record_type = 'paste_flag';

-- ---------- Homework ----------
-- Every unit id is a short id without spaces (teacher-api checks it is a real unit). None at all is allowed.
create function private.valid_unit_ids(ids text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(u ~ '^[a-z0-9-]{1,40}$'), true) from unnest(ids) u
$$;
grant execute on function private.valid_unit_ids(text[]) to authenticated, service_role;

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,          -- deleted with the class
  created_by uuid default auth.uid() references public.teachers (id) on delete set null,
  task_count int not null check (task_count between 1 and 200),
  due_on date not null,
  units text[] not null default '{}' check (cardinality(units) <= 60 and private.valid_unit_ids(units)), -- none: any unit
  created_at timestamptz not null default now()
);
create index homework_class_id on public.homework (class_id);

create table public.homework_progress (
  homework_id uuid not null references public.homework (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  done int not null default 0 check (done >= 0),
  complete boolean not null default false,
  units text[] not null default '{}',     -- the units the counted tasks were done in
  task_ids text[] not null default '{}',  -- the counted tasks
  updated_at timestamptz not null default now(),
  primary key (homework_id, student_id)
);
create index homework_progress_student_id on public.homework_progress (student_id);

-- ---------- Privileges and row-level security ----------
-- Supabase grants new tables to anon and authenticated: take that back, then grant only what is used.
revoke all on table public.homework, public.homework_progress from anon, authenticated;
grant select, delete, insert (class_id, task_count, due_on, units) on public.homework to authenticated;
grant select on public.homework_progress to authenticated;
grant select, insert, delete on public.homework to service_role;
grant select, insert, update, delete on public.homework_progress to service_role;

alter table public.homework enable row level security;
alter table public.homework_progress enable row level security;

-- Teachers on the class (owner or co-teacher: private.my_class_ids, as changed by 0016). A homework a teacher adds
-- directly is always theirs (created_by defaults to the signed-in teacher and can't be set).
create policy "teacher reads own classes' homework" on public.homework for select to authenticated
  using (class_id in (select private.my_class_ids()));
create policy "teacher adds own classes' homework" on public.homework for insert to authenticated
  with check (class_id in (select private.my_class_ids()) and created_by = (select auth.uid()));
create policy "teacher deletes own classes' homework" on public.homework for delete to authenticated
  using (class_id in (select private.my_class_ids()));
create policy "teacher reads own students' homework progress" on public.homework_progress for select to authenticated
  using (student_id in (select private.my_student_ids()));

commit;
