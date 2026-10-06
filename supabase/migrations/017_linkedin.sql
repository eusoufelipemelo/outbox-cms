-- LinkedIn (Community Management API): páginas de empresa ligadas aos clientes e posts feitos pelo CMS.
create table if not exists public.li_pages (
  id uuid primary key default gen_random_uuid(),
  org_urn text not null unique,                 -- urn:li:organization:123
  name text not null,
  vanity_name text,                             -- linkedin.com/company/<vanity_name>
  website text,
  client_id uuid references public.clients(id) on delete set null,
  synced_at timestamptz not null default now()
);
create index if not exists li_pages_client_idx on public.li_pages (client_id);
alter table public.li_pages enable row level security;

create table if not exists public.li_posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.li_pages(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  li_urn text,                                  -- urn:li:share:… ou urn:li:ugcPost:…
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists li_posts_post_idx on public.li_posts (post_id);
alter table public.li_posts enable row level security;

-- Serviço LinkedIn por cliente: cada artigo aprovado vira post na página da empresa.
alter table public.clients add column if not exists svc_linkedin boolean not null default false;
