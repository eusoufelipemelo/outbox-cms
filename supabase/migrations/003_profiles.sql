-- 003_profiles — equipe do CMS: perfil, papel e aprovação de contas.
-- Qualquer pessoa pode criar conta (e-mail ou Google), mas só entra no painel depois
-- que um admin aprova em /equipe. O primeiro perfil criado vira admin ativo.
-- Idempotente: pode rodar mais de uma vez.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text,
  avatar_url text,
  role text not null default 'editor' check (role in ('admin','editor')),
  status text not null default 'pending' check (status in ('pending','active','blocked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);
create index if not exists profiles_status_idx on public.profiles(status);

-- Fechado para acesso direto: só o servidor (service role) lê e escreve.
alter table public.profiles enable row level security;

-- Cria o perfil quando uma conta nasce em auth.users (e-mail ou Google).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_first boolean;
begin
  -- Serializa cadastros simultâneos para existir um único "primeiro" admin.
  perform pg_advisory_xact_lock(hashtext('public.profiles.first_admin'));
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, name, avatar_url, role, status, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(meta->>'name', meta->>'full_name', '')), ''),
    nullif(coalesce(meta->>'avatar_url', meta->>'picture', ''), ''),
    case when is_first then 'admin' else 'editor' end,
    case when is_first then 'active' else 'pending' end,
    case when is_first then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil igual ao da conta.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Contas que já existiam antes desta migração já usavam o CMS: entram ativas.
-- A mais antiga vira admin (se ainda não houver admin).
with ranked as (
  select u.*, row_number() over (order by u.created_at, u.id) as rn
  from auth.users u
)
insert into public.profiles (id, email, name, avatar_url, role, status, created_at, approved_at)
select
  r.id,
  coalesce(r.email, ''),
  nullif(btrim(coalesce(r.raw_user_meta_data->>'name', r.raw_user_meta_data->>'full_name', '')), ''),
  nullif(coalesce(r.raw_user_meta_data->>'avatar_url', r.raw_user_meta_data->>'picture', ''), ''),
  case when r.rn = 1 and not exists (select 1 from public.profiles p where p.role = 'admin') then 'admin' else 'editor' end,
  'active',
  r.created_at,
  now()
from ranked r
on conflict (id) do nothing;
