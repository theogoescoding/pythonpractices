-- Certificates: a student earns one for a block of units once every unit in it has its floor at 100%
-- (certificates.js holds the rule). One row per student per block, kept once earned.
--   - Only the server writes this table: teacher-api (certificates_for_class, certificate_for_student) works out what
--     each student has earned and adds the new ones, as the service role. Teachers and students never write it.
--   - A teacher reads the certificates of the students in their classes, as owner or co-teacher (the
--     private.my_student_ids helper, which migration 0016 made owner-or-co-teacher). Students can't read it: their
--     requests go through student-api, which doesn't send it.
--   - Deleted with the student (and so with the class).
-- One transaction: if any statement fails, nothing changes.

begin;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  block_id text not null check (block_id in ('fundamentals', 'advanced', 'validation', 'searching-sorting',
    'programming-techniques', 'data-structures')),
  block_name text not null check (char_length(block_name) between 1 and 100),
  earned_on date not null,
  created_at timestamptz not null default now(),
  unique (student_id, block_id)
);

-- Supabase grants new tables to anon and authenticated: take that back, then grant only what is used.
revoke all on table public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;
grant select, insert on public.certificates to service_role;

alter table public.certificates enable row level security;
create policy "teacher reads own students' certificates" on public.certificates for select to authenticated
  using (student_id in (select private.my_student_ids()));

commit;
