# OutBox CMS

CMS multi-site da OutBox Soluções Digitais: escreva um artigo uma vez, escolha em quais sites de
clientes ele vai ao ar e publique em todos de uma vez. Produção: https://cms.outboxgroup.com.br

## Como os artigos chegam ao site do cliente

Cada site cadastrado tem uma plataforma de entrega:

| Plataforma | Como funciona | Quando usar |
| --- | --- | --- |
| **Content API** | O site busca os artigos em `/api/v1/posts?key=pk_…` ou usa o script de embed | Sites Next.js/React, landing pages, HTML puro |
| **WordPress** | O CMS cria/atualiza o post direto no WordPress (REST API + senha de aplicativo) | Sites em WordPress |
| **Webhook** | O CMS envia o artigo assinado (HMAC-SHA256) para uma URL do site | n8n, Zapier, sites com build próprio |

Qualquer site pode, além disso, receber um webhook a cada publicação (útil para revalidar cache).
O passo a passo com os códigos prontos de cada site fica na tela **Integrações** do CMS.

Embed em qualquer página HTML:

```html
<div id="outbox-blog"></div>
<script src="https://cms.outboxgroup.com.br/embed.js" data-key="pk_…" async></script>
```

## Diferenciais

- Publicação simultânea em vários sites, com status por destino e reenvio em caso de falha
- Variação por site com IA (tom de voz, cidade e palavras-chave do cliente) para evitar conteúdo duplicado,
  e marcação de site canônico
- Painel de SEO com prévia do Google e checklist
- Agendamento com agenda editorial
- Painel "Rede de sites": mostra há quantos dias cada cliente está sem artigo novo
- Histórico de versões, biblioteca de mídia, sitemap e RSS por site, contagem de leituras

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha as chaves do Supabase
npm install
npm run dev
```

Banco: rode `supabase/schema.sql` no SQL Editor do Supabase (e depois os arquivos de `supabase/migrations/`).
Usuários são criados em Supabase → Authentication → Users → Add user.

## Deploy (Easypanel)

Serviço `outboxcms` no projeto `experts`, build pelo `Dockerfile` a partir da branch `main`.
Variáveis obrigatórias: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `PORT=3000`.
Opcionais: `ANTHROPIC_API_KEY` (assistente de IA), `CRON_SECRET`, `AI_MODEL`, `OUTBOX_DISABLE_SCHEDULER`.
