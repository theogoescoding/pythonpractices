-- Paste flag details: three optional columns on events, used only by paste flags (record_type 'paste_flag', 0018).
--   - paste_phase: where the student was (practice, placement, endless or assignment).
--   - paste_lines: how many lines were pasted (the count paste-flag.js already works out; the text itself is never stored).
--   - paste_homework_id: the open homework the paste was in, or null. Set to null if that homework is deleted.
-- Every other record type keeps all three null. Paste flags saved before this migration keep null too: the teacher's
-- overview shows "Not recorded" for them, and works out the phase from the student's next check where it can.
-- Grants: authenticated has select on the whole of events (so teachers read the new columns, under the existing
-- "teacher reads own students' events" policy) and insert on a list of columns that doesn't include them, so teachers
-- can't write them; service_role (student-api) has every privilege on the whole table. So no new grant is needed.
-- One transaction: if any statement fails, nothing changes.

begin;

alter table public.events
  add column paste_phase text check (paste_phase in ('practice', 'placement', 'endless', 'assignment')),
  add column paste_lines int check (paste_lines > 0),
  add column paste_homework_id uuid references public.homework (id) on delete set null;

alter table public.events add constraint events_paste_details_only_paste_flags
  check (record_type = 'paste_flag' or (paste_phase is null and paste_lines is null and paste_homework_id is null));

-- Finding the flags of a deleted homework (on delete set null) without reading the whole table.
create index events_paste_homework_id on public.events (paste_homework_id) where paste_homework_id is not null;

-- A paste flag may only name a homework of the student's own class (student-api checks it too), as an attempt may only
-- name an assignment of the student's own class (0005).
create function private.check_event_homework() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.paste_homework_id is not null and not exists (
    select 1 from public.homework h join public.students s on s.class_id = h.class_id
    where h.id = new.paste_homework_id and s.id = new.student_id
  ) then
    raise exception 'homework % is not for this student''s class', new.paste_homework_id using errcode = '23503';
  end if;
  return new;
end $$;
create trigger events_check_homework before insert or update of paste_homework_id, student_id on public.events
  for each row execute function private.check_event_homework();

commit;
