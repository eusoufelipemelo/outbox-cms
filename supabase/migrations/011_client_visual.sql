-- Identidade visual das imagens geradas por IA, por cliente.
alter table public.clients add column if not exists image_style text;
alter table public.clients add column if not exists image_mood text not null default 'auto'
  check (image_mood in ('auto', 'escuro', 'claro', 'colorido', 'monocromatico'));
