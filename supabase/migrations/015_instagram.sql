-- Instagram (API com login do Instagram): contas dos clientes e posts gerados pelo CMS.
create table if not exists public.ig_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  ig_user_id text not null,
  username text,
  access_token text not null,                 -- cifrado (enc:v1:…), vale 60 dias e é renovado sozinho
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.ig_accounts enable row level security;

create table if not exists public.ig_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  kind text not null default 'carousel' check (kind in ('carousel', 'image', 'story')),
  slides jsonb not null default '[]'::jsonb,  -- [{ url, title, text }]
  caption text,
  status text not null default 'draft' check (status in ('draft', 'publishing', 'published', 'failed')),
  ig_media_id text,
  permalink text,
  error text,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ig_posts_client_idx on public.ig_posts (client_id, created_at desc);
alter table public.ig_posts enable row level security;

-- Automação: gerar e publicar carrossel + story quando o artigo for ao ar.
alter table public.automations add column if not exists ig_post boolean not null default false;
