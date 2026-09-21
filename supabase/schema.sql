-- OutBox CMS — schema inicial
-- Todo acesso aos dados passa pelo servidor do CMS (service role).
-- RLS fica ligado em todas as tabelas sem políticas públicas: anon/authenticated não leem nada direto.

create extension if not exists pgcrypto;

-- ============ Clientes ============
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- nome fantasia
  legal_name text,
  document text,                            -- CNPJ/CPF
  contact_name text,
  email text,
  phone text,
  segment text,                             -- ex.: marcenaria, odontologia
  city text,
  state text,
  logo_url text,
  brand_color text,
  tone_of_voice text,                       -- como a marca fala (usado pela IA)
  audience text,                            -- público-alvo
  keywords text[] not null default '{}',    -- palavras-chave prioritárias
  notes text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Sites (destinos de publicação) ============
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  url text not null,                        -- https://www.cliente.com.br
  blog_path text not null default '/blog',  -- onde os artigos vivem no site
  platform text not null default 'api' check (platform in ('api','wordpress','webhook')),
  -- chave pública da Content API / embed
  public_key text not null unique default ('pk_' || encode(gen_random_bytes(16), 'hex')),
  -- webhook (Next.js, Astro, Zapier, n8n...) — disparado a cada publicação
  webhook_url text,
  webhook_secret text not null default encode(gen_random_bytes(24), 'hex'),
  -- WordPress (REST API + senha de aplicativo)
  wp_url text,
  wp_username text,
  wp_app_password text,
  wp_default_status text not null default 'publish' check (wp_default_status in ('publish','draft')),
  default_author text,
  default_category text,
  status text not null default 'active' check (status in ('active','paused')),
  last_check_at timestamptz,
  last_check_ok boolean,
  last_check_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sites_client_idx on public.sites(client_id);

-- ============ Artigos ============
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  slug text not null default '',
  excerpt text,
  content_html text not null default '',
  content_json jsonb,
  cover_image_url text,
  cover_image_alt text,
  category text,
  tags text[] not null default '{}',
  author_name text,
  seo_title text,
  seo_description text,
  focus_keyword text,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  word_count int not null default 0,
  reading_minutes int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_status_idx on public.posts(status);
create index if not exists posts_scheduled_idx on public.posts(scheduled_at) where status = 'scheduled';

-- ============ Publicações (artigo x site) ============
create table if not exists public.post_sites (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','published','failed','unpublished')),
  is_canonical boolean not null default false,       -- site "dono" do conteúdo original
  -- variação do artigo para este site (evita conteúdo duplicado entre clientes)
  override_title text,
  override_excerpt text,
  override_content_html text,
  override_seo_title text,
  override_seo_description text,
  slug text,                                          -- slug específico do site (opcional)
  external_id text,                                   -- id do post no WordPress
  external_url text,                                  -- URL final no site do cliente
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, site_id)
);
create index if not exists post_sites_site_idx on public.post_sites(site_id, status);

-- Versão publicada por destino (002_snapshots). A Content API, o embed, o sitemap e o feed servem
-- só o `snapshot`: o autosave do editor não muda o que está no ar até alguém clicar em Atualizar.
-- `alter ... if not exists` fica fora do create table para valer também em bancos já criados.
alter table public.post_sites add column if not exists snapshot jsonb;          -- artigo no formato público, overrides aplicados
alter table public.post_sites add column if not exists snapshot_at timestamptz; -- quando o snapshot foi gravado
create index if not exists post_sites_site_snapshot_slug_idx
  on public.post_sites (site_id, (snapshot->>'slug'))
  where status = 'published';

-- ============ Log de entregas ============
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  post_site_id uuid references public.post_sites(id) on delete set null,   -- remover um destino não apaga o log
  post_id uuid references public.posts(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  channel text not null check (channel in ('api','wordpress','webhook')),
  event text not null check (event in ('publish','update','unpublish','test')),
  ok boolean not null,
  status_code int,
  message text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists deliveries_post_idx on public.deliveries(post_id, created_at desc);
create index if not exists deliveries_site_idx on public.deliveries(site_id, created_at desc);

-- ============ Histórico de versões ============
create table if not exists public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  title text,
  content_html text,
  seo_title text,
  seo_description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists post_revisions_post_idx on public.post_revisions(post_id, created_at desc);

-- ============ Biblioteca de mídia ============
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  url text not null,
  alt text,
  mime text,
  size int,
  width int,
  height int,
  client_id uuid references public.clients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============ Estatísticas de leitura (via Content API / embed) ============
create table if not exists public.post_views (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  day date not null default current_date,
  views int not null default 0,
  unique (post_id, site_id, day)
);

create or replace function public.increment_post_view(p_post uuid, p_site uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.post_views (post_id, site_id, day, views)
  values (p_post, p_site, current_date, 1)
  on conflict (post_id, site_id, day) do update set views = public.post_views.views + 1;
$$;
revoke all on function public.increment_post_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.increment_post_view(uuid, uuid) to service_role;

-- ============ updated_at automático ============
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();
drop trigger if exists sites_touch on public.sites;
create trigger sites_touch before update on public.sites for each row execute function public.touch_updated_at();
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();
drop trigger if exists post_sites_touch on public.post_sites;
create trigger post_sites_touch before update on public.post_sites for each row execute function public.touch_updated_at();

-- ============ RLS: tudo fechado para acesso direto ============
alter table public.clients enable row level security;
alter table public.sites enable row level security;
alter table public.posts enable row level security;
alter table public.post_sites enable row level security;
alter table public.deliveries enable row level security;
alter table public.post_revisions enable row level security;
alter table public.media enable row level security;
alter table public.post_views enable row level security;

-- ============ Storage: bucket público para imagens dos artigos ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/svg+xml'])
on conflict (id) do nothing;

-- A contagem de leituras é chamada pelo servidor (service role)
grant execute on function public.increment_post_view(uuid, uuid) to service_role;

-- ============ Equipe: perfis e aprovação (igual a migrations/003_profiles.sql) ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text,
  avatar_url text,
  role text not null default 'editor' check (role in ('admin','editor')),
  status text not null default 'pending' check (status in ('pending','active','blocked')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);
create index if not exists profiles_status_idx on public.profiles(status);

-- Fechado para acesso direto: só o servidor (service role) lê e escreve.
alter table public.profiles enable row level security;

-- Cria o perfil quando uma conta nasce em auth.users (e-mail ou Google).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  is_first boolean;
begin
  -- Serializa cadastros simultâneos para existir um único "primeiro" admin.
  perform pg_advisory_xact_lock(hashtext('public.profiles.first_admin'));
  select not exists (select 1 from public.profiles) into is_first;

  insert into public.profiles (id, email, name, avatar_url, role, status, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(btrim(coalesce(meta->>'name', meta->>'full_name', '')), ''),
    nullif(coalesce(meta->>'avatar_url', meta->>'picture', ''), ''),
    case when is_first then 'admin' else 'editor' end,
    case when is_first then 'active' else 'pending' end,
    case when is_first then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil igual ao da conta.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Contas que já existiam antes desta migração já usavam o CMS: entram ativas.
-- A mais antiga vira admin (se ainda não houver admin).
with ranked as (
  select u.*, row_number() over (order by u.created_at, u.id) as rn
  from auth.users u
)
insert into public.profiles (id, email, name, avatar_url, role, status, created_at, approved_at)
select
  r.id,
  coalesce(r.email, ''),
  nullif(btrim(coalesce(r.raw_user_meta_data->>'name', r.raw_user_meta_data->>'full_name', '')), ''),
  nullif(coalesce(r.raw_user_meta_data->>'avatar_url', r.raw_user_meta_data->>'picture', ''), ''),
  case when r.rn = 1 and not exists (select 1 from public.profiles p where p.role = 'admin') then 'admin' else 'editor' end,
  'active',
  r.created_at,
  now()
from ranked r
on conflict (id) do nothing;
-- 004_geo — campos de GEO (otimização para mecanismos de resposta com IA) e entidade do cliente.
-- Idempotente.

-- Artigo: blocos que as IAs extraem e citam
alter table public.posts add column if not exists answer_summary text;                          -- resposta direta (40–60 palavras) no topo
alter table public.posts add column if not exists key_takeaways text[] not null default '{}';   -- pontos principais
alter table public.posts add column if not exists faq jsonb not null default '[]';              -- [{ "question": "", "answer": "" }]
alter table public.posts add column if not exists sources jsonb not null default '[]';          -- [{ "title": "", "url": "", "publisher": "" }]
alter table public.posts add column if not exists content_type text not null default 'article';
do $$ begin
  alter table public.posts add constraint posts_content_type_check
    check (content_type in ('article','howto','guide','list','comparison','news'));
exception when duplicate_object then null; end $$;

-- Variação por site também cobre os blocos de GEO
alter table public.post_sites add column if not exists override_answer_summary text;
alter table public.post_sites add column if not exists override_faq jsonb;

-- Cliente como entidade (Organization/LocalBusiness no schema.org, llms.txt, autoria E-E-A-T)
alter table public.clients add column if not exists about text;                 -- o que a empresa faz, em 2–3 frases
alter table public.clients add column if not exists services text[] not null default '{}';
alter table public.clients add column if not exists service_area text;          -- ex.: "Curitiba e região metropolitana"
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists opening_hours text;
alter table public.clients add column if not exists social_links text[] not null default '{}';
alter table public.clients add column if not exists expert_name text;           -- especialista que assina/revisa
alter table public.clients add column if not exists expert_credentials text;    -- ex.: "Cirurgiã-dentista, CRO-PR 12345"
alter table public.clients add column if not exists expert_bio text;

-- Site: chave do IndexNow (Bing, Yandex e buscadores que alimentam IAs)
alter table public.sites add column if not exists indexnow_key text not null default encode(gen_random_bytes(16), 'hex');
-- 005 — perfil completo (dados obrigatórios no CMS) e função "Redator" (escreve, não publica).
-- Idempotente.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','editor','writer'));
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
alter table public.diagnostics add column if not exists ai boolean not null default true;
alter table public.diagnostics add column if not exists report_source text check (report_source in ('ai', 'template'));
