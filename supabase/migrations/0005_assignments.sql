-- Class assignments: a teacher sets a list of bank tasks for one class. Practice only: an assignment never changes a
-- student's progress (the app makes sure of that); the attempt log records what happened, with the assignment id.
-- Teachers create, change, close and delete their own classes' assignments directly, under row-level security.
-- Students never read this table: student-api sends them the open assignments of their own class.

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,  -- deleted with the class
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  task_ids text[] not null check (cardinality(task_ids) between 1 and 50),  -- bank task ids, in the order set
  status text not null default 'open' check (status in ('open', 'closed')),  -- students see only open ones
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_class_id on public.assignments (class_id);

-- Every task id is a short id without spaces (the app checks it is a bank task).
create function private.valid_task_ids(ids text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(i ~ '^[A-Za-z0-9-]{1,40}$'), false) from unnest(ids) i
$$;
alter table public.assignments add constraint assignments_task_ids_valid check (private.valid_task_ids(task_ids));

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger assignments_touch before update on public.assignments
  for each row execute function private.touch_updated_at();

-- ---------- Attempts on an assignment ----------
-- phase gains 'assignment'; assignment_id names the assignment (kept when it is closed; cleared if it is deleted).
-- It is the last column of the full export (assignment_id), so no earlier column changes.
alter table public.attempts drop constraint attempts_phase_check;
alter table public.attempts add constraint attempts_phase_check
  check (phase in ('placement', 'practice', 'endless', 'assignment'));
alter table public.attempts add column assignment_id uuid references public.assignments (id) on delete set null;
alter table public.attempts add constraint attempts_assignment_phase
  check (assignment_id is null or phase = 'assignment');
create index attempts_assignment_id on public.attempts (assignment_id) where assignment_id is not null;

-- An attempt may only name an assignment of the student's own class.
create function private.check_attempt_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.assignment_id is not null and not exists (
    select 1 from public.assignments a join public.students s on s.class_id = a.class_id
    where a.id = new.assignment_id and s.id = new.student_id
  ) then
    raise exception 'assignment % is not for this student''s class', new.assignment_id using errcode = '23503';
  end if;
  return new;
end $$;
create trigger attempts_check_assignment before insert or update of assignment_id, student_id on public.attempts
  for each row execute function private.check_attempt_assignment();

-- ---------- Privileges and row-level security ----------
revoke all on table public.assignments from anon, authenticated;
grant execute on function private.valid_task_ids(text[]) to authenticated, service_role;
grant select, delete, insert (class_id, title, description, task_ids, status), update (title, description, task_ids, status)
  on public.assignments to authenticated;

alter table public.assignments enable row level security;

-- Only the teacher who owns the class can see or change its assignments.
create policy "teacher reads own assignments" on public.assignments for select to authenticated
  using (class_id in (select private.my_class_ids()));
create policy "teacher adds own assignments" on public.assignments for insert to authenticated
  with check (class_id in (select private.my_class_ids()));
create policy "teacher updates own assignments" on public.assignments for update to authenticated
  using (class_id in (select private.my_class_ids())) with check (class_id in (select private.my_class_ids()));
create policy "teacher deletes own assignments" on public.assignments for delete to authenticated
  using (class_id in (select private.my_class_ids()));
