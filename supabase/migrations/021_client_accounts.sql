-- Área do cliente com conta: o cliente cria login e senha num link único (/cliente).
-- A conta dele mora em auth.users + profiles com o papel 'client' e o cliente (empresa) a que pertence.
-- Contas de cliente nunca entram no CMS da equipe (requireUser recusa o papel 'client').

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'editor', 'writer', 'client'));
alter table public.profiles add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.profiles add column if not exists company_name text; -- empresa informada no cadastro
create index if not exists profiles_client_idx on public.profiles (client_id) where role = 'client';

-- Cadastro feito pela área do cliente (metadado area = 'cliente') já nasce com o papel 'client'.
-- O metadado é escrito por quem se cadastra, mas só consegue rebaixar: 'client' não abre nada sem a equipe liberar.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_client boolean := coalesce(meta->>'area', '') = 'cliente';
  is_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('public.profiles.first_admin'));
  select not exists (select 1 from public.profiles) into is_first;
  if is_client then is_first := false; end if;

  insert into public.profiles (id, email, name, avatar_url, phone, company_name, role, status, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(meta->>'name', meta->>'full_name', '')), ''),
    nullif(coalesce(meta->>'avatar_url', meta->>'picture', ''), ''),
    case when is_client then nullif(btrim(coalesce(meta->>'phone', '')), '') end,
    case when is_client then nullif(btrim(coalesce(meta->>'company', '')), '') end,
    case when is_client then 'client' when is_first then 'admin' else 'editor' end,
    case when is_first then 'active' else 'pending' end,
    case when is_first then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- E-mails liberados pela equipe: quem se cadastrar com um deles entra direto no cliente certo.
create table if not exists public.client_invites (
  email text primary key check (email = lower(email)),
  client_id uuid not null references public.clients(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.client_invites enable row level security;

-- O cliente também pode recusar o artigo (não quer este tema/texto).
alter table public.posts drop constraint if exists posts_approval_status_check;
alter table public.posts add constraint posts_approval_status_check check (approval_status in ('awaiting', 'changes', 'approved', 'rejected'));

alter table public.automation_runs drop constraint if exists automation_runs_status_check;
alter table public.automation_runs add constraint automation_runs_status_check
  check (status in ('running', 'awaiting', 'approved', 'published', 'changes', 'failed', 'manual', 'rejected'));

select
  (select count(*) from profiles where role = 'client') as contas_de_cliente,
  (select count(*) from client_invites) as convites,
  (select conname from pg_constraint where conname = 'posts_approval_status_check') as check_posts;
