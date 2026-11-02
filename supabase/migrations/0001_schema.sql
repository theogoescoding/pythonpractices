-- Tables for the backend mode of the Python practice app.
-- Column names and values in attempts and events are the full export's (teacher-data.js FULL_COLUMNS and VALUE_NOTES),
-- so a backend row maps to an export row without renaming. Columns the export doesn't have are marked "not exported".

create extension if not exists pgcrypto with schema extensions;

-- Helpers that are not reachable through the API (PostgREST only exposes public).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- Teachers ----------
create table public.teachers (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

-- ---------- Classes ----------
-- Class codes use capitals and digits without the ones that are easy to confuse (0 O 1 I L).
create function private.new_class_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    select string_agg(substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1), '' order by i)
      into code
      from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i;
    exit when not exists (select 1 from public.classes c where c.class_code = code);
  end loop;
  return code;
end $$;

-- 31 August at the end of the current school year (a school year runs 1 September to 31 August).
create function private.end_of_school_year(d date) returns date
language sql immutable set search_path = '' as $$
  select make_date(extract(year from d)::int + case when extract(month from d) >= 9 then 1 else 0 end, 8, 31)
$$;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references public.teachers (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  class_code text not null unique check (class_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  created_at timestamptz not null default now(),
  end_of_year date not null default private.end_of_school_year(current_date)
);
create index classes_teacher_id on public.classes (teacher_id);

-- The class code is always made here, so a teacher can't choose one.
create function private.set_class_code() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.class_code := private.new_class_code();
  return new;
end $$;
create trigger classes_set_class_code before insert on public.classes
  for each row execute function private.set_class_code();

-- ---------- Students ----------
-- Nickname rules (section 6): 2 to 20 letters, digits and single spaces, no space at either end.
-- The word filter is applied in the join-class Edge Function.
create function private.valid_nickname(n text) returns boolean
language sql immutable set search_path = '' as $$
  select n is not null and char_length(n) between 2 and 20 and n ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$'
$$;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  nickname text not null check (private.valid_nickname(nickname)),
  login_lookup text not null unique,     -- HMAC-SHA256 of the 8-digit code with LOOKUP_KEY (made in the Edge Function)
  login_code_enc text not null,          -- the 8-digit code, AES-GCM with CODE_KEY (made in the Edge Function)
  pin_hash text not null,                -- bcrypt of the 4-digit PIN
  failed_pins int not null default 0 check (failed_pins between 0 and 5),
  locked_until timestamptz,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index students_class_nickname on public.students (class_id, lower(nickname));

-- ---------- Progress ----------
-- JSON columns here and below are json, not jsonb: json keeps the text as sent, so keys come back in the app's order
-- (the export prints failure_details and placement_results with JSON.stringify, and state must come back unchanged).
-- state is one unit's state exactly as the app saves it in progress.units[unit] (app.js freshUnitState),
-- or progress.endless for unit 'endless'. level, placement and completed are read from it, so they can't disagree.
create table public.progress (
  student_id uuid not null references public.students (id) on delete cascade,
  unit text not null check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'endless')),
  state json not null check (json_typeof(state) = 'object'),
  level int generated always as ((state ->> 'level')::int) stored,
  placement json generated always as (state -> 'placement') stored,
  completed boolean generated always as (coalesce((state ->> 'completedTop')::boolean, false)) stored,
  updated_at timestamptz not null default now(),
  primary key (student_id, unit)
);

-- ---------- Passed tasks ----------
-- Fingerprints exactly as the app makes them (a bank task's id, or a template variant's fingerprint).
create table public.passed_tasks (
  student_id uuid not null references public.students (id) on delete cascade,
  unit text not null check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count')),
  fingerprint text not null check (char_length(fingerprint) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (student_id, unit, fingerprint)
);

-- ---------- Attempts ----------
-- One row per Check press, skip and "Show me how" (record_type attempt, skip, hint), as in the full export.
create table public.attempts (
  id bigint generated always as identity primary key,               -- not exported
  record_id text not null check (record_id ~ '^a-[a-z0-9-]{1,40}$'), -- the app's id; makes a resent batch harmless
  student_id uuid not null references public.students (id) on delete cascade,
  record_type text not null check (record_type in ('attempt', 'skip', 'hint')),
  "timestamp" timestamptz not null,                                -- when it happened (the app's clock)
  unit text not null check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count')),
  task_units text[],                                                -- not exported: every unit of the task (combined Endless tasks have two)
  task_id text not null check (char_length(task_id) between 1 and 200),
  template_id text,
  phase text check (phase in ('placement', 'practice', 'endless')),
  task_type text check (task_type in ('predict', 'fill', 'parsons', 'write', 'scratch')),
  task_level int check (task_level between 1 and 10),
  student_level_before int check (student_level_before between 1 and 10),
  student_level_after int check (student_level_after between 1 and 10),
  attempt_number int check (attempt_number >= 0),
  result text not null,
  failure_category text,
  failure_details json,
  misconception_matches text[] not null default '{}',
  hints_used int check (hints_used between 0 and 3),
  hint_type text,
  variant_fingerprint text,
  failed_test_number int check (failed_test_number >= 1),
  failed_test_inputs json check (failed_test_inputs is null or json_typeof(failed_test_inputs) = 'array'),
  expected_output text,
  student_output text check (char_length(student_output) <= 2100),
  student_error_type text,
  student_error_kind text,
  student_code text check (char_length(student_code) <= 2100),
  code_hash text,                                                   -- not exported: HMAC of student_code, kept after the code is cleared
  code_deleted_at timestamptz,                                      -- not exported: when student_code and student_output were cleared
  created_at timestamptz not null default now(),                    -- not exported: when the server received it
  unique (student_id, record_id),
  check (
    (record_type = 'attempt' and result in ('pass', 'fail')) or
    (record_type = 'skip' and result = 'skipped') or
    (record_type = 'hint' and result = coalesce(hint_type, 'hint'))
  )
);
create index attempts_created_at_with_code on public.attempts (created_at) where student_code is not null;

-- ---------- Events ----------
-- Level changes, button uses, placement results and placement resets, with the export's columns for each.
create table public.events (
  id bigint generated always as identity primary key,               -- not exported
  record_id text not null check (record_id ~ '^[lbp]-[a-z0-9-]{1,40}$'), -- the app's id (level changes get an l- id when sent)
  student_id uuid not null references public.students (id) on delete cascade,
  record_type text not null check (record_type in ('level_change', 'button_use', 'placement_result', 'placement_reset')),
  "timestamp" timestamptz not null,
  unit text not null check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count')),
  task_id text,
  student_level_before int check (student_level_before between 1 and 10),
  student_level_after int check (student_level_after between 1 and 10),
  level_change_reason text check (level_change_reason in ('passes', 'fast', 'fails', 'hints', 'recovery', 'placement',
    'too-easy', 'too-hard', 'completed', 'reset', 'test-mode', 'test-mode-completed')),
  button text check (button in ('too-easy', 'too-hard')),
  placement_start_level int check (placement_start_level between 1 and 10),
  placement_results json check (placement_results is null or json_typeof(placement_results) = 'array'),
  created_at timestamptz not null default now(),                    -- not exported
  unique (student_id, record_id),
  check (record_type <> 'level_change' or (level_change_reason is not null and student_level_after is not null)),
  check (record_type <> 'button_use' or button is not null),
  check (record_type <> 'placement_result' or placement_results is not null)
);
create index events_student_id on public.events (student_id);

-- ---------- Code reveals (audit, not exported) ----------
-- One row per student each time a teacher uses "Show codes". Written by the teacher-api Edge Function only.
create table public.code_reveals (
  id bigint generated always as identity primary key,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  revealed_at timestamptz not null default now()
);
create index code_reveals_class_id on public.code_reveals (class_id);
