-- 005 — perfil completo (dados obrigatórios no CMS) e função "Redator" (escreve, não publica).
-- Idempotente.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','editor','writer'));
