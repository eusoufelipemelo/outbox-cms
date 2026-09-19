-- 002_snapshots — versão publicada por destino (post_sites.snapshot).
-- Idempotente: pode rodar mais de uma vez.
alter table public.post_sites add column if not exists snapshot jsonb;
alter table public.post_sites add column if not exists snapshot_at timestamptz;
create index if not exists post_sites_site_snapshot_slug_idx
  on public.post_sites (site_id, (snapshot->>'slug'))
  where status = 'published';
