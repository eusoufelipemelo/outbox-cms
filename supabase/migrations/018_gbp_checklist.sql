-- Checklist de otimização do Google Empresas por cliente (itens marcados e anotações).
create table if not exists public.gbp_checklists (
  client_id uuid primary key references public.clients(id) on delete cascade,
  items jsonb not null default '{}'::jsonb,   -- { chave: { done, at, note } }
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.gbp_checklists enable row level security;
