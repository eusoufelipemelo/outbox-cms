-- Google Empresas (Business Profile API): perfis ligados aos clientes e publicações feitas pelo CMS.
create table if not exists public.gbp_locations (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,                 -- accounts/123
  location_name text not null unique,         -- locations/456
  title text not null,
  address text,
  website text,
  maps_uri text,
  client_id uuid references public.clients(id) on delete set null,
  unit_id text,                               -- id da unidade (filial) em clients.units, quando for filial
  synced_at timestamptz not null default now()
);
create index if not exists gbp_locations_client_idx on public.gbp_locations (client_id);
alter table public.gbp_locations enable row level security;

create table if not exists public.gbp_posts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.gbp_locations(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  gbp_name text,                              -- accounts/…/locations/…/localPosts/…
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists gbp_posts_post_idx on public.gbp_posts (post_id);
alter table public.gbp_posts enable row level security;

-- Automação: publicar também no Google Empresas quando o artigo for ao ar.
alter table public.automations add column if not exists gbp_post boolean not null default false;
