-- Serviços contratados por cliente e o que decorre deles.
-- Blog e Google Empresas são vendidos juntos (um inclui o outro); Instagram é à parte.
-- Pacote completo (os dois): o artigo do blog é a base do post do Google e do Instagram.
-- Só Instagram: calendário e pautas próprios (ig_automations).
alter table public.clients add column if not exists svc_blog_gbp boolean not null default false;
alter table public.clients add column if not exists svc_instagram boolean not null default false;
alter table public.clients add column if not exists ig_formats text[] not null default '{carousel,story}';

-- Telegram passa a ser do cliente (vale para blog e Instagram); preserva as conversas já conectadas.
alter table public.clients add column if not exists telegram_chat_id text;
alter table public.clients add column if not exists telegram_link_code text;
update public.clients c set telegram_chat_id = a.telegram_chat_id, telegram_link_code = a.telegram_link_code
  from public.automations a where a.client_id = c.id and c.telegram_link_code is null;
update public.clients set telegram_link_code = encode(gen_random_bytes(4), 'hex') where telegram_link_code is null;
alter table public.clients alter column telegram_link_code set default encode(gen_random_bytes(4), 'hex');
create unique index if not exists clients_telegram_link_code_idx on public.clients (telegram_link_code);

-- Quem já tem site no CMS segue com Blog + Google Empresas.
update public.clients c set svc_blog_gbp = true where exists (select 1 from public.sites s where s.client_id = c.id);

-- Calendário do Instagram independente (clientes só de Instagram).
create table if not exists public.ig_automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  active boolean not null default true,
  per_month int not null default 8 check (per_month between 1 and 60),
  weekdays int[] not null default '{1,3,5}',
  hour int not null default 11 check (hour between 0 and 23),
  approval text not null default 'telegram' check (approval in ('telegram', 'auto', 'manual')),
  focus text,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ig_automations_due_idx on public.ig_automations (next_run_at) where active;
alter table public.ig_automations enable row level security;

-- Posts do Instagram: origem, aprovação e recado do cliente.
alter table public.ig_posts add column if not exists source text not null default 'article';
alter table public.ig_posts add column if not exists approval_token text default encode(gen_random_bytes(12), 'hex');
alter table public.ig_posts add column if not exists feedback text;
alter table public.ig_posts add column if not exists telegram_message_id bigint;
alter table public.ig_posts drop constraint if exists ig_posts_status_check;
alter table public.ig_posts add constraint ig_posts_status_check check (status in ('draft', 'awaiting', 'changes', 'publishing', 'published', 'failed'));
