-- The five A-level data structures units: records-tuples, stacks-queues, linked-lists, hash-tables and arrays-3d.
--   - Every table that names a unit gets the five new units in its check, after the programming techniques units, so
--     a student's progress, passed tasks, attempts and events in them are accepted.
-- Nothing else changes: no table, column, row or other check is dropped or altered. The explainer shown on these
-- units' tasks is content only (tasks.json and templates.json): it needs no column.
-- Deploy this (and the Edge Functions, whose _shared/rows.ts lists the units too) BEFORE publishing the website with
-- the new units: until then the server refuses those units' work.
-- One transaction: if any statement fails, every table keeps its old rules.

begin;

alter table public.progress drop constraint progress_unit_check;
alter table public.progress add constraint progress_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort',
    'recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging',
    'records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d', 'endless'));

alter table public.passed_tasks drop constraint passed_tasks_unit_check;
alter table public.passed_tasks add constraint passed_tasks_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort',
    'recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging',
    'records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d'));

alter table public.attempts drop constraint attempts_unit_check;
alter table public.attempts add constraint attempts_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort',
    'recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging',
    'records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d'));

alter table public.events drop constraint events_unit_check;
alter table public.events add constraint events_unit_check
  check (unit in ('output', 'variables', 'maths', 'selection', 'loops-condition', 'loops-count', 'data-types', 'strings', 'random', 'lists',
    'functions-basic', 'functions-return', 'file-handling', 'arrays-2d', 'validation', 'authentication',
    'trace-tables', 'linear-search', 'binary-search', 'bubble-sort', 'insertion-sort', 'merge-sort',
    'recursion', 'scope-parameters', 'oop-classes', 'oop-methods', 'oop-encapsulation', 'oop-inheritance', 'debugging',
    'records-tuples', 'stacks-queues', 'linked-lists', 'hash-tables', 'arrays-3d'));

commit;
