@AGENTS.md

# OutBox CMS — guia do projeto

CMS multi-site da agência OutBox: a equipe escreve um artigo uma vez, escolhe em quais
sites de clientes ele vai ao ar e publica. Domínio: https://cms.outboxgroup.com.br
Idioma da interface: português do Brasil. Modo light apenas.

## Stack
- Next.js 16 (App Router, `src/`, Turbopack). **Leia `node_modules/next/dist/docs/` antes de usar APIs** —
  `middleware` agora é `src/proxy.ts`; `params`, `searchParams`, `cookies()` são async;
  tipos globais `PageProps<"/rota">` e `LayoutProps<"/rota">`.
- Tailwind v4 (tokens em `src/app/globals.css` via `@theme`). Sem shadcn.
- Supabase (Postgres + Auth + Storage). Schema em `supabase/schema.sql`, tipos em `src/lib/types.ts`.
- Ícones: `lucide-react`. Toasts: `sonner`. Validação: `zod` (v4). Editor: TipTap v3.

## Acesso a dados (regra de segurança)
- Todas as tabelas têm RLS ligado **sem políticas**. Só o servidor lê/escreve, via `db()` de
  `src/lib/supabase/admin.ts` (service role).
- Toda server action / route handler do painel começa com `await requireUser()` (`src/lib/auth.ts`).
  `requireUser()` também exige conta aprovada (`profiles.status = 'active'`): pendente vai para
  `/aguardando-aprovacao`, bloqueada volta ao login. Gestão da equipe usa `requireAdmin()`.
- Cadastro é aberto (Google ou e-mail), mas toda conta nova nasce `pending` até um admin aprovar em `/equipe`
  (exceto domínios de `AUTO_APPROVE_DOMAINS`). O primeiro perfil criado vira admin.
- Telas de entrada em `src/app/(entrada)/` (login, cadastro, esqueci-senha, redefinir-senha, aguardando-aprovacao);
  retorno dos links do Supabase em `src/app/auth/callback/route.ts`. Mensagens de erro em `src/lib/auth-errors.ts`.
- Rotas públicas (sem login) ficam em `/api/v1/*`, `/embed.js`, `/api/cron/*`, `/api/health`, `/auth/*` — liberadas em `src/proxy.ts`
  (`PUBLIC_PREFIXES`); as telas de entrada ficam em `AUTH_PAGES` (sessão renovada, sem redirecionar).
  Elas autenticam pelo `sites.public_key` (Content API) ou `CRON_SECRET`.
- Nunca exponha `wp_app_password`, `webhook_secret` ou a service role ao cliente, exceto o
  `webhook_secret` na tela do site (para o dev do cliente validar assinatura).
- Variáveis de ambiente só via `src/lib/env.ts` (lidas em runtime, não no build).

## Organização (dono de cada pasta)
- `src/app/(app)/` — telas logadas (layout com sidebar em `src/components/shell/nav.tsx`).
- `src/lib/data/*.ts` — consultas e server actions por domínio (`"use server"` nos arquivos de actions).
- `src/lib/delivery/` — motor de publicação (API, WordPress, webhook) e agendador.
- `src/app/api/v1/` — Content API pública para os sites dos clientes.
- `src/lib/ai/` + `src/app/api/ai/` — assistente de escrita (Claude), opcional via `ANTHROPIC_API_KEY`.
- `src/components/ui/` — primitivas compartilhadas. Reutilize antes de criar outra.

## Contratos entre módulos (não mude assinaturas sem atualizar os consumidores)
```ts
// src/lib/delivery/index.ts (server-only)
publishPost(postId: string, opts?: { siteIds?: string[]; event?: "publish" | "update" }): Promise<PublishResult[]>
unpublishPost(postId: string, siteIds?: string[]): Promise<PublishResult[]>
testSiteConnection(siteId: string): Promise<{ ok: boolean; message: string }>
siteArticleUrl(site: { url: string; blog_path: string }, slug: string): string
type PublishResult = { siteId: string; siteName: string; ok: boolean; channel: SitePlatform; url: string | null; message: string }

// src/components/media/media-picker.tsx (client)
<MediaPicker open={boolean} onClose={() => void} onSelect={(m: { url: string; alt: string | null }) => void} clientId?: string />
// POST /api/media  (multipart: file, alt?, client_id?)  → Media (JSON)

// src/lib/ai/client.ts (client) — chama POST /api/ai
callAi<A extends AiAction>(action: A, input: AiInput[A]): Promise<AiOutput[A]>   // lança Error com mensagem pt-BR
// GET /api/ai → { enabled: boolean }
```

## Design system (OutBox, light)
- Cores (use as classes Tailwind geradas pelos tokens): `bg-paper` fundo do app, `bg-surface` painéis,
  `bg-sunken` áreas internas, `text-ink` títulos (preto puro da marca), `text-text` corpo, `text-muted`
  secundário, `border-line` / `border-line-strong`. Laranja `brand` (#F15532) é **reservado** para:
  botão Publicar (`variant="publish"`, texto preto), destino selecionado (classe `.notch`) e indicador
  de navegação ativo. Laranja para texto usa `text-brand-ink`. Estados: `ok`, `warn`, `danger`, `info` (+ `-soft`).
- Tipografia: Archivo (UI e títulos; `.display` = título de página largo e pesado, eco do logotipo),
  Source Serif 4 (`font-serif`, só no texto do artigo — classe `.prose-article`), JetBrains Mono (`font-mono`,
  só para chaves/código/snippets).
- Raios: painéis `rounded-[var(--radius-panel)]` (16px), controles `rounded-[var(--radius-control)]` (10px), pílulas 999px.
- Sombra só em elementos flutuantes (`shadow-[var(--shadow-pop)]`). Painéis usam borda, não sombra.
- Primitivas: `Button`/`buttonClass`, `Input`/`Textarea`/`Select`/`Field`/`Label`, `Badge`/`PostStatusBadge`/
  `PublicationBadge`, `Panel`/`PageHeader`/`EmptyState`, `CopyField`.
- Texto: sentence case, sem CAIXA ALTA em rótulos, sem emoji, sem "→" em botões, sem strings "A · B · C".
  Botões dizem a ação ("Salvar cliente", "Publicar em 3 sites"); o toast repete o verbo ("Cliente salvo").
  Erros dizem o que houve e como resolver. Estados vazios convidam à ação.
- Acessibilidade: foco visível (já global), `aria-label` em botões só com ícone, `<label>` em todo campo,
  alvos ≥ 40px, contraste AA, `prefers-reduced-motion` respeitado (global). Responsivo até 375px.
- Movimento: só em resposta a ação do usuário (abrir, confirmar). Os únicos momentos "coreografados" são a
  sequência de entrega após Publicar (cada destino acende em ordem) e o ensaio dela no lado da marca das
  telas de entrada (classes `.entry-*` em `globals.css`).

## Checagens
`npx tsc --noEmit` e `npm run lint` devem passar. `npm run build` antes de entregar.
