-- Temas escolhidos pelo cliente (ou pela equipe a pedido dele): a automação escreve a partir deles.
create table if not exists public.client_topics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  notes text,                                   -- orientação do cliente para o artigo
  source text not null default 'equipe' check (source in ('equipe', 'cliente')),
  status text not null default 'pending' check (status in ('pending', 'used')),
  run_id uuid references public.automation_runs(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists client_topics_queue_idx on public.client_topics (client_id, status, created_at);
alter table public.client_topics enable row level security;

-- De onde vêm os temas da automação: a IA escolhe, temas do cliente primeiro, ou só temas do cliente.
alter table public.automations add column if not exists topic_mode text not null default 'auto'
  check (topic_mode in ('auto', 'client_first', 'client_only'));
