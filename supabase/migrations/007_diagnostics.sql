-- 007 — Diagnóstico de presença digital (site + Google Empresas) com relatório para o cliente.
create table if not exists public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  business_name text,
  city text,
  client_id uuid references public.clients(id) on delete set null,
  status text not null default 'running' check (status in ('running','done','failed')),
  step text,
  error text,
  scores jsonb,
  pagespeed jsonb,
  site_checks jsonb,
  business jsonb,
  report jsonb,
  share_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists diagnostics_created_idx on public.diagnostics (created_at desc);
alter table public.diagnostics enable row level security;
