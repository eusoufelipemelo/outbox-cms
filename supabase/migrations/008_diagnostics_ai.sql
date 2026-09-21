-- Diagnóstico: escolha entre relatório escrito pela IA (pago) e relatório padrão (gratuito).
alter table public.diagnostics add column if not exists ai boolean not null default true;
alter table public.diagnostics add column if not exists report_source text check (report_source in ('ai', 'template'));
