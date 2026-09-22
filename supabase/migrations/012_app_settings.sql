-- Painel administrativo: chaves e modelos guardados no banco (valores sensíveis cifrados).
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
