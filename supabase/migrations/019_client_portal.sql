-- Área do cliente: link exclusivo por cliente para aprovar artigos ou pedir ajustes.
alter table public.clients add column if not exists portal_token text;
update public.clients set portal_token = encode(gen_random_bytes(16), 'hex') where portal_token is null;
alter table public.clients alter column portal_token set default encode(gen_random_bytes(16), 'hex');
create unique index if not exists clients_portal_token_idx on public.clients (portal_token);

-- Aprovação do artigo pelo cliente (vale para a automação e para artigos feitos pela equipe).
alter table public.posts add column if not exists approval_status text check (approval_status in ('awaiting', 'changes', 'approved'));
alter table public.posts add column if not exists approval_client_id uuid references public.clients(id) on delete set null;
alter table public.posts add column if not exists approval_feedback text;
alter table public.posts add column if not exists approval_history jsonb not null default '[]'::jsonb; -- [{ at, by, kind, text }]
alter table public.posts add column if not exists approval_requested_at timestamptz;
alter table public.posts add column if not exists approval_decided_at timestamptz;
create index if not exists posts_approval_idx on public.posts (approval_client_id, approval_status);

-- Automação: nova forma de aprovação só pela área do cliente.
alter table public.automations drop constraint if exists automations_approval_check;
alter table public.automations add constraint automations_approval_check check (approval in ('telegram', 'portal', 'auto', 'manual'));

-- Rascunhos da automação que já estavam com o cliente passam a aparecer na área do cliente.
update public.posts p
   set approval_status = case r.status when 'changes' then 'changes' else 'awaiting' end,
       approval_client_id = r.client_id,
       approval_feedback = r.feedback,
       approval_requested_at = r.created_at
  from public.automation_runs r
 where r.post_id = p.id and r.status in ('awaiting', 'changes') and p.approval_status is null;
