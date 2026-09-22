-- Automação: cada cliente ganha uma rotina que cria artigo + capa e manda para aprovação.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  active boolean not null default true,
  -- ritmo
  per_month int not null default 4 check (per_month between 1 and 30),
  weekdays int[] not null default '{2}',            -- 0 = domingo … 6 = sábado
  hour int not null default 9 check (hour between 0 and 23),
  -- artigo
  words int not null default 900 check (words between 400 and 2500),
  content_type text,                                 -- nulo = a IA escolhe
  cover boolean not null default true,
  cover_model text not null default 'gemini-3.1-flash-image',
  site_ids uuid[] not null default '{}',             -- vazio = todos os sites ativos do cliente
  -- aprovação: telegram (cliente aprova), auto (publica sozinho), manual (fica em rascunho)
  approval text not null default 'telegram' check (approval in ('telegram', 'auto', 'manual')),
  telegram_chat_id text,
  telegram_link_code text not null unique default encode(gen_random_bytes(4), 'hex'),
  -- execução
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_due_idx on public.automations (next_run_at) where active;
alter table public.automations enable row level security;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  status text not null default 'running'
    check (status in ('running', 'awaiting', 'approved', 'published', 'changes', 'failed', 'manual')),
  step text,
  error text,
  idea jsonb,
  feedback text,
  approval_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_recent_idx on public.automation_runs (created_at desc);
create index if not exists automation_runs_automation_idx on public.automation_runs (automation_id, created_at desc);
alter table public.automation_runs enable row level security;

drop trigger if exists automations_touch on public.automations;
create trigger automations_touch before update on public.automations
  for each row execute function public.touch_updated_at();
