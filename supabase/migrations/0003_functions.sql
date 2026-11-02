-- Functions for the nightly jobs and the Edge Functions. Only the service role (and postgres, for pg_cron) may run them.

-- ---------- Retention ----------
-- Deletes classes whose end_of_year has passed. The cascade removes their students and all their data.
create function public.delete_expired_classes() returns int
language sql security definer set search_path = '' as $$
  with gone as (delete from public.classes where end_of_year < current_date returning 1)
  select count(*)::int from gone
$$;

-- Clears program code and output kept longer than keep_for. code_hash, failure_category, failure_details and
-- misconception_matches stay.
create function public.clear_old_program_code(keep_for interval default interval '30 days') returns int
language sql security definer set search_path = '' as $$
  with cleared as (
    update public.attempts set student_code = null, student_output = null, code_deleted_at = now()
    where student_code is not null and created_at < now() - keep_for
    returning 1
  )
  select count(*)::int from cleared
$$;

-- ---------- PIN checks (resume) ----------
-- Called before the PIN is compared. Counts the try straight away, so tries sent at the same moment can't get past
-- the limit: the 5th try in a row locks the account for 15 minutes and starts the count again.
-- allowed is false while the account is locked. locked_until says until when: while locked, and also on the try that
-- sets the lock (so a wrong PIN on that try can say how long to wait).
create function public.pin_try_begin(p_student uuid, out allowed boolean, out locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  s public.students%rowtype;
begin
  select * into s from public.students where id = p_student for update;
  if not found then allowed := false; return; end if;
  if s.locked_until is not null and s.locked_until > now() then
    allowed := false; locked_until := s.locked_until; return;
  end if;
  if s.failed_pins + 1 >= 5 then
    locked_until := now() + interval '15 minutes';
    update public.students set failed_pins = 0, locked_until = pin_try_begin.locked_until where id = p_student;
  else
    update public.students set failed_pins = s.failed_pins + 1, locked_until = null where id = p_student;
  end if;
  allowed := true;
end $$;

-- The PIN was right: clear the count and any lock set by this same try.
create function public.pin_try_succeeded(p_student uuid) returns void
language sql security definer set search_path = '' as $$
  update public.students set failed_pins = 0, locked_until = null where id = p_student
$$;

-- ---------- Rate limit (resume and join-class) ----------
-- key is a keyed hash of the caller's IP made in the Edge Function, never the IP itself.
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (key, window_start)
);

-- Counts one request. Returns false once more than max_hits arrive in the same fixed window.
create function public.rate_limit_hit(p_key text, p_max_hits int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  win timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into private.rate_limits as r (key, window_start, hits) values (p_key, win, 1)
    on conflict (key, window_start) do update set hits = r.hits + 1
    returning hits into n;
  return n <= p_max_hits;
end $$;

-- Clears every counter. Used by tests/backend between tests (service role only, which can change any data anyway).
create function public.reset_rate_limits() returns void
language sql security definer set search_path = '' as $$
  delete from private.rate_limits where true -- (the API refuses a delete without a where clause)
$$;

create function public.clear_old_rate_limits() returns int
language sql security definer set search_path = '' as $$
  with gone as (delete from private.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::int from gone
$$;

-- ---------- Reset placement (teacher-api) ----------
-- Does what app.js resetPlacement does to the saved unit state: a new pending placement that keeps the placement
-- tasks already used, and no task in progress. Writes a placement_reset event in the same transaction.
-- Returns false if the student isn't the teacher's or hasn't started the unit (nothing to reset).
create function public.reset_placement(p_teacher uuid, p_student uuid, p_unit text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s join public.classes c on c.id = s.class_id
                 where s.id = p_student and c.teacher_id = p_teacher) then
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

revoke execute on function public.delete_expired_classes(), public.clear_old_program_code(interval),
  public.pin_try_begin(uuid), public.pin_try_succeeded(uuid), public.rate_limit_hit(text, int, int),
  public.clear_old_rate_limits(), public.reset_rate_limits(), public.reset_placement(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_expired_classes(), public.clear_old_program_code(interval),
  public.pin_try_begin(uuid), public.pin_try_succeeded(uuid), public.rate_limit_hit(text, int, int),
  public.clear_old_rate_limits(), public.reset_rate_limits(), public.reset_placement(uuid, uuid, text)
  to service_role;
