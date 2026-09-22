-- Autor dos artigos automáticos (por cliente) e vigência do contrato.
alter table public.automations add column if not exists author_name text;
alter table public.clients add column if not exists contract_start date;
alter table public.clients add column if not exists contract_end date;
