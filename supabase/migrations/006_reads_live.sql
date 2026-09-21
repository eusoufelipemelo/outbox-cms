-- 006 — leituras com hora (painel "ao vivo"). O total por dia continua em post_views.
-- Guardamos só um identificador anônimo do visitante (hash), por até 7 dias.
create table if not exists public.reads (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  site_id uuid not null references public.sites(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  visitor text not null
);
create index if not exists reads_at_idx on public.reads (at desc);
create index if not exists reads_site_at_idx on public.reads (site_id, at desc);
alter table public.reads enable row level security;
