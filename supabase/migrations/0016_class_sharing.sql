-- Class sharing: a class can have more than one teacher.
--   - class_teachers lists every teacher on a class: its owner (still classes.teacher_id) and any co-teachers.
--     Every existing class gets one row for its owner, and every new class gets one (trigger below).
--   - A co-teacher has the same access as the owner to the class, its students and all their data, and its
--     assignments: every policy that checked classes.teacher_id = auth.uid() now also accepts a class_teachers row.
--   - Owner only: deleting the class ("teacher deletes own classes" is unchanged), and adding or removing co-teachers
--     (only teacher-api does that, as the service role: teachers can read class_teachers but never write it).
--   - Students are not affected: the class code and joining stay the same.
-- teacher-api (add_co_teacher, remove_co_teacher, list_co_teachers) uses the two service-role functions at the end.
-- One transaction: if any statement fails, nothing changes.

begin;

-- ---------- Table ----------
create table public.class_teachers (
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  added_by uuid references public.teachers (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);
create index class_teachers_teacher_id on public.class_teachers (teacher_id);

-- One row for the owner of every class that exists already.
insert into public.class_teachers (class_id, teacher_id, added_by, added_at)
  select c.id, c.teacher_id, c.teacher_id, c.created_at from public.classes c
  on conflict (class_id, teacher_id) do nothing;

-- And for the owner of every new class. Security definer: teachers can't write class_teachers themselves.
create function private.add_class_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.class_teachers (class_id, teacher_id, added_by) values (new.id, new.teacher_id, new.teacher_id)
    on conflict (class_id, teacher_id) do nothing;
  return null;
end $$;
create trigger classes_add_owner after insert on public.classes
  for each row execute function private.add_class_owner();

-- ---------- Helpers ----------
-- Whether the signed-in teacher is on a class: its owner, or a co-teacher. Security definer with a fixed
-- search_path, so a policy doesn't run class_teachers' own policy row by row.
create function private.is_class_teacher(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid())
      or exists (select 1 from public.class_teachers ct where ct.class_id = p_class and ct.teacher_id = auth.uid())
$$;

-- The two helpers from 0002_rls.sql, now owner or co-teacher. Every policy that uses them (students, progress,
-- passed_tasks, attempts, events, assignments) gives a co-teacher the same access as the owner.
create or replace function private.my_class_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select c.id from public.classes c where c.teacher_id = auth.uid()
  union
  select ct.class_id from public.class_teachers ct where ct.teacher_id = auth.uid()
$$;

create or replace function private.my_student_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s where s.class_id in (select private.my_class_ids())
$$;

-- The teachers on any of my classes (for their names on the Classes page and the Teachers panel).
create function private.my_colleague_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select ct.teacher_id from public.class_teachers ct where ct.class_id in (select private.my_class_ids())
  union
  select c.teacher_id from public.classes c where c.id in (select private.my_class_ids())
$$;

revoke execute on function private.add_class_owner(), private.is_class_teacher(uuid), private.my_colleague_ids()
  from public, anon, authenticated;
grant execute on function private.is_class_teacher(uuid), private.my_colleague_ids() to authenticated;

-- ---------- Privileges and row-level security ----------
-- Teachers may read the rows of their own classes, nothing else. Adding and removing go through teacher-api.
revoke all on table public.class_teachers from anon, authenticated;
grant select on public.class_teachers to authenticated;
alter table public.class_teachers enable row level security;
create policy "teacher reads own classes' teachers" on public.class_teachers for select to authenticated
  using (class_id in (select private.my_class_ids()));

-- Classes: a co-teacher sees and changes (name, end date, stage: the columns teachers may update) a shared class.
-- "teacher adds own classes" and "teacher deletes own classes" are unchanged: only the owner deletes a class.
alter policy "teacher reads own classes" on public.classes
  using (teacher_id = (select auth.uid()) or private.is_class_teacher(id));
alter policy "teacher updates own classes" on public.classes
  using (teacher_id = (select auth.uid()) or private.is_class_teacher(id))
  with check (teacher_id = (select auth.uid()) or private.is_class_teacher(id));

-- Teachers: also the names of the other teachers on my classes (read only; "teacher reads own row" stays).
create policy "teacher reads co-teachers' names" on public.teachers for select to authenticated
  using (id in (select private.my_colleague_ids()));

-- Code reveals: also the reveals of my classes by their other teachers (the log of who showed the codes).
alter policy "teacher reads own code reveals" on public.code_reveals
  using (teacher_id = (select auth.uid()) or class_id in (select private.my_class_ids()));

-- ---------- Server functions ----------
-- reset_placement (0003_functions.sql): the teacher may be the owner or a co-teacher. Otherwise unchanged.
create or replace function public.reset_placement(p_teacher uuid, p_student uuid, p_unit text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s join public.classes c on c.id = s.class_id
                 where s.id = p_student and (c.teacher_id = p_teacher or exists (
                   select 1 from public.class_teachers ct where ct.class_id = c.id and ct.teacher_id = p_teacher))) then
    return false;
  end if;
  -- (state is json; going through jsonb here puts its keys in jsonb's order, which the app doesn't depend on)
  update public.progress p set
    state = (p.state::jsonb || jsonb_build_object(
      'placement', jsonb_build_object('status', 'pending', 'taskIds', '[]'::jsonb, 'step', 0, 'results', '[]'::jsonb,
        'startLevel', null, 'used', coalesce(p.state::jsonb #> '{placement,used}', '[]'::jsonb)),
      'current', null))::json,
    updated_at = now()
  where p.student_id = p_student and p.unit = p_unit and p_unit <> 'endless';
  if not found then return false; end if;
  insert into public.events (record_id, student_id, record_type, "timestamp", unit)
    values ('p-' || to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || '-' ||
              encode(extensions.gen_random_bytes(3), 'hex'),
            p_student, 'placement_reset', now(), p_unit);
  return true;
end $$;

-- The teacher with this email (teacher-api add_co_teacher). Only someone who has signed in as a teacher (and so has
-- a teachers row) is found. Reads auth.users, so it is for the service role only.
create function public.teacher_by_email(p_email text) returns table (id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name from public.teachers t join auth.users u on u.id = t.id
  where lower(u.email) = lower(btrim(p_email))
  limit 1
$$;

-- The teachers on a class, owner first (teacher-api list_co_teachers and the Teachers panel).
create function public.class_teacher_list(p_class uuid)
  returns table (teacher_id uuid, name text, email text, is_owner boolean, added_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ct.teacher_id, t.name, u.email::text, ct.teacher_id = c.teacher_id, ct.added_at
  from public.class_teachers ct
  join public.classes c on c.id = ct.class_id
  join public.teachers t on t.id = ct.teacher_id
  left join auth.users u on u.id = ct.teacher_id
  where ct.class_id = p_class
  order by (ct.teacher_id = c.teacher_id) desc, lower(t.name), ct.added_at
$$;

revoke execute on function public.teacher_by_email(text), public.class_teacher_list(uuid) from public, anon, authenticated;
grant execute on function public.teacher_by_email(text), public.class_teacher_list(uuid) to service_role;

commit;
