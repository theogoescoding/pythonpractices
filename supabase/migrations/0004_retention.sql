-- Nightly retention jobs (times in UTC). Needs the pg_cron extension.
create extension if not exists pg_cron with schema pg_catalog;

-- Program code and output: kept in full for 30 days, then cleared. Hash, category, details and matches stay.
select cron.schedule('clear-old-program-code', '0 2 * * *', $$select public.clear_old_program_code()$$);

-- Classes past their end_of_year date, with their students and all their data.
select cron.schedule('delete-expired-classes', '15 2 * * *', $$select public.delete_expired_classes()$$);

-- Rate-limit counters older than a day.
select cron.schedule('clear-old-rate-limits', '30 2 * * *', $$select public.clear_old_rate_limits()$$);
