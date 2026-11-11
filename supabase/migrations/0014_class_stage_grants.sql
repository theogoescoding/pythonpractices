-- Lets a teacher set a class's stage (migration 0013's classes.stage) when making the class and change it later.
-- 0002_rls.sql grants teachers only some columns of classes (insert and update of name and end_of_year), and 0013
-- added the stage column without granting it, so every new class that sent a stage was refused ("permission denied
-- for table classes") and the Stage "Save" button failed the same way.
-- Row-level security still limits both to the teacher's own classes, and 0013's check still allows only ks3, gcse or
-- a-level. Nothing else changes.
-- One transaction: if any statement fails, nothing is granted.

begin;

grant insert (stage), update (stage) on public.classes to authenticated;

commit;
