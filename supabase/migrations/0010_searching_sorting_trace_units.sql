-- The "Trace tables" unit (trace-tables) and the five searching and sorting units (linear-search, binary-search,
-- bubble-sort, insertion-sort, merge-sort), and the two new task types (trace, partial-parsons).
--   - Every table that names a unit gets the six new units in its check, after validation and authentication, so a
--     student's progress, passed tasks, attempts and events in them are accepted.
--   - attempts.task_type accepts trace (a trace table) and partial-parsons (pick the missing line).
-- Nothing else changes: no table, column or row is dropped or altered.
-- Deploy this (and the Edge Functions, whose _shared/rows.ts lists the units too) BEFORE publishing the website with
-- the new units: until then the server refuses those units' work, and attempts on the new task types.
-- One transaction: if any statement fails, every table keeps its old rules.

begin;

alter table public.progress drop constraint progress_unit_check;
alter table public.progress add constraint progress_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort', 'endless'));

alter table public.passed_tasks drop constraint passed_tasks_unit_check;
alter table public.passed_tasks add constraint passed_tasks_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort'));

alter table public.attempts drop constraint attempts_unit_check;
alter table public.attempts add constraint attempts_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort'));

alter table public.events drop constraint events_unit_check;
alter table public.events add constraint events_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort'));

alter table public.attempts drop constraint attempts_task_type_check;
alter table public.attempts add constraint attempts_task_type_check
  check (task_type in ('predict', 'fill', 'parsons', 'write', 'scratch', 'trace', 'partial-parsons'));

commit;
