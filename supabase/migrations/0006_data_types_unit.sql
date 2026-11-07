-- The "Data types and casting" unit (id data-types). Every table that names a unit gets it in its check, so a
-- student's progress, passed tasks, attempts and events in the new unit are accepted. Nothing else changes.
-- Deploy this (and the Edge Functions, whose _shared/rows.ts lists the units too) BEFORE publishing the website with
-- the new unit: until then the server refuses that unit's work for good.
-- One transaction: if any statement fails, every table keeps its old unit rule.

begin;

alter table public.progress drop constraint progress_unit_check;
alter table public.progress add constraint progress_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'endless'));

alter table public.passed_tasks drop constraint passed_tasks_unit_check;
alter table public.passed_tasks add constraint passed_tasks_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types'));

alter table public.attempts drop constraint attempts_unit_check;
alter table public.attempts add constraint attempts_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types'));

alter table public.events drop constraint events_unit_check;
alter table public.events add constraint events_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types'));

commit;
