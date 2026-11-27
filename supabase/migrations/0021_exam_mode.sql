-- Exam Mode on the server (prompt EM2; decisions 1, 2, 9, 14, 15 and 16).
--   - exam_attempts: one row per marked Exam Mode attempt, as exam.js keeps it (the mark for each mark point, auto- or
--     self-marked; notes; "Say it simply"; the paste flag). Only student-api writes it (as the service role); teachers on
--     the class (owner or co-teacher) read their students' rows; students never read the table (student-api sends them
--     their own). The code of an attempt that lost marks is kept 30 days, like attempts.student_code; the marks stay.
--   - classes.exam_mode: a teacher's switch for the class. Null follows the stage (on for GCSE, off for KS3 and
--     A-level); public.exam_mode_effective gives the effective value (exam.js examModeOn is the same rule). teacher-api
--     set_exam_mode changes it.
--   - events gains two Exam Mode record types, with an x- id and no unit: exam_model_seen (the question's id in task_id:
--     after it, tries at that question aren't recorded, decision 9) and exam_tutorial_seen.
--   - The nightly clear_old_program_code also clears exam_attempts.student_code after 30 days.
-- Deleting a student (a teacher, "Delete everything saved for me", or the class ending) deletes their exam_attempts
-- (on delete cascade), as it does their attempts. Marking stays in the browser (decision 2): the server checks shapes and
-- sums, not answers.
-- One transaction: if any statement fails, nothing changes.

begin;

-- ---------- The class switch ----------
alter table public.classes add column exam_mode boolean; -- null: follow the stage

create function public.exam_mode_effective(p_stage text, p_setting boolean) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_setting, coalesce(p_stage, 'gcse') = 'gcse')
$$;
grant execute on function public.exam_mode_effective(text, boolean) to authenticated, service_role;

-- ---------- Exam Mode events ----------
alter table public.events drop constraint events_record_type_check;
alter table public.events add constraint events_record_type_check
  check (record_type in ('level_change', 'button_use', 'placement_result', 'placement_reset', 'paste_flag',
    'exam_model_seen', 'exam_tutorial_seen'));
-- An x- id for the two Exam Mode events only; every other event keeps 0018's l-, b-, p- or f- id.
alter table public.events drop constraint events_record_id_check;
alter table public.events add constraint events_record_id_check check (
  (record_type in ('exam_model_seen', 'exam_tutorial_seen') and record_id ~ '^x-[a-z0-9-]{1,40}$') or
  (record_type not in ('exam_model_seen', 'exam_tutorial_seen') and record_id ~ '^[lbpf]-[a-z0-9-]{1,40}$'));
-- An Exam Mode event belongs to no unit; every other event still needs one (and the unit check still applies to it).
alter table public.events alter column unit drop not null;
alter table public.events add constraint events_unit_unless_exam
  check ((record_type in ('exam_model_seen', 'exam_tutorial_seen')) = (unit is null));
alter table public.events add constraint events_exam_model_seen_question
  check (record_type <> 'exam_model_seen' or (task_id is not null and task_id ~ '^[A-Za-z0-9-]{1,40}$'));
create index events_exam_model_seen on public.events (student_id, task_id) where record_type = 'exam_model_seen';

-- ---------- Exam attempts ----------
create table public.exam_attempts (
  id bigint generated always as identity primary key,
  record_id text not null check (record_id ~ '^x-[a-z0-9-]{1,40}$'),  -- the app's id; makes a resent batch harmless
  student_id uuid not null references public.students (id) on delete cascade,
  "timestamp" timestamptz not null,                                   -- when it happened (the student's device)
  pack_id text not null check (pack_id ~ '^[A-Za-z0-9-]{1,40}$'),
  question_id text not null check (question_id ~ '^[A-Za-z0-9-]{1,40}$'),
  rung int not null check (rung between 1 and 5),
  step int check (step between 1 and 20),                             -- rung 4's step, or rung 1's part; null otherwise
  attempt_number int not null check (attempt_number >= 1),
  first boolean not null,                                             -- the first attempt at this question and rung (and step)
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 1 and 20),
  total int not null,
  max int not null,
  auto_total int not null,                                            -- counting only the auto-marked points (decision 8)
  auto_max int not null,
  notes text[] not null default '{}' check (cardinality(notes) <= 10),
  help_used boolean not null default false,                           -- "Say it simply" (decision 14)
  paste_flag boolean not null default false,
  assignment_id uuid references public.assignments (id) on delete set null, -- used from EM3
  student_code text check (char_length(student_code) <= 2100),        -- only when marks were lost; cleared after 30 days
  code_hash text,                                                     -- HMAC of student_code, kept after the code is cleared
  code_deleted_at timestamptz,
  created_at timestamptz not null default now(),                      -- when the server received it
  unique (student_id, record_id),
  check (max between 1 and 20 and total between 0 and max),
  check (auto_max between 0 and max and auto_total between 0 and auto_max and auto_total <= total),
  check (step is null or rung in (1, 4)),
  check (student_code is null or total < max)
);
create index exam_attempts_student_id on public.exam_attempts (student_id);
create index exam_attempts_created_at_with_code on public.exam_attempts (created_at) where student_code is not null;
create index exam_attempts_assignment_id on public.exam_attempts (assignment_id) where assignment_id is not null;

-- An attempt may only name an assignment of the student's own class (0005's check, which reads only the new row's
-- assignment_id and student_id).
create trigger exam_attempts_check_assignment before insert or update of assignment_id, student_id on public.exam_attempts
  for each row execute function private.check_attempt_assignment();

-- Nothing after the model answer (decision 9): a try at a question made after the student opened its model answer
-- (an exam_model_seen event) is refused. student-api refuses it first, with its reason; this is the backstop.
create function private.check_exam_model_seen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.events e
             where e.student_id = new.student_id and e.record_type = 'exam_model_seen' and e.task_id = new.question_id
               and e."timestamp" < new."timestamp") then
    raise exception 'a try at % made after its model answer was opened', new.question_id using errcode = '23514';
  end if;
  return new;
end $$;
create trigger exam_attempts_check_model_seen before insert on public.exam_attempts
  for each row execute function private.check_exam_model_seen();

-- ---------- Privileges and row-level security ----------
revoke all on table public.exam_attempts from anon, authenticated;
grant select on public.exam_attempts to authenticated;
grant select, insert, update, delete on public.exam_attempts to service_role;
alter table public.exam_attempts enable row level security;
-- Teachers on the class (owner or co-teacher: private.my_student_ids, as changed by 0016). Nobody else reads it, and
-- no teacher writes it.
create policy "teacher reads own students' exam attempts" on public.exam_attempts for select to authenticated
  using (student_id in (select private.my_student_ids()));

-- ---------- Retention ----------
-- 0003's nightly job, now for Exam Mode code too: kept in full for 30 days, then cleared. Marks, notes and code_hash stay.
create or replace function public.clear_old_program_code(keep_for interval default interval '30 days') returns int
language sql security definer set search_path = '' as $$
  with cleared as (
    update public.attempts set student_code = null, student_output = null, code_deleted_at = now()
    where student_code is not null and created_at < now() - keep_for
    returning 1
  ), cleared_exam as (
    update public.exam_attempts set student_code = null, code_deleted_at = now()
    where student_code is not null and created_at < now() - keep_for
    returning 1
  )
  select ((select count(*) from cleared) + (select count(*) from cleared_exam))::int
$$;

commit;
