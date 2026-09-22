-- Unidades do cliente além da matriz (o endereço principal do cadastro): filiais, lojas, escritórios.
-- Lista em JSON: [{ id, label, address, city, state, phone, manager, maps_name }]
alter table public.clients add column if not exists units jsonb not null default '[]'::jsonb;
