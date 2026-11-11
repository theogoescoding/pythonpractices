-- A class's stage: KS3, GCSE or A-level (classes.stage). The teacher chooses it when making the class and can change
-- it later (row-level security already lets a teacher update their own classes). It decides which units the teacher
-- view's Students page shows, and which sections of the students' unit menu open by default.
--   - Every class that exists already becomes GCSE (the default), so nothing changes for them until a teacher
--     chooses another stage.
-- Nothing else changes: no table, row or other check is dropped or altered.
-- The website and the student-api Edge Function work with or without it (without it every class is shown as GCSE,
-- and a stage can't be saved), so it can be deployed before or after them.
-- One transaction: if any statement fails, the table keeps its old shape.

begin;

alter table public.classes add column stage text not null default 'gcse'
  constraint classes_stage_check check (stage in ('ks3', 'gcse', 'a-level'));

commit;
