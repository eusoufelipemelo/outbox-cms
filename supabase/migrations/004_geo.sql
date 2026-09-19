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
