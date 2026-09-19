import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Plug, Settings2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { siteArticleUrl } from "@/lib/delivery";
import type { SitePlatform } from "@/lib/types";
import { formatDateTime, hostname } from "@/lib/utils";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { EmptyState, PageHeader, Panel } from "@/components/ui/panel";
import { IntegrationTabs } from "@/components/integrations/integration-tabs";
import { SitePicker } from "@/components/integrations/site-picker";
import { DeliveryFilter, DeliveryList, type DeliveryRow } from "@/components/integrations/delivery-list";
import * as S from "@/components/integrations/snippets";
import { PLATFORM } from "@/components/clients/options";

export const metadata: Metadata = { title: "Integrações" };

type IntegrationSite = {
  id: string;
  client_id: string;
  name: string;
  url: string;
  blog_path: string;
  platform: SitePlatform;
  public_key: string;
  webhook_url: string | null;
  indexnow_key: string | null;
  status: "active" | "paused";
  last_check_at: string | null;
  last_check_ok: boolean | null;
  last_check_message: string | null;
  client: { id: string; name: string } | null;
};

// Nunca selecione wp_app_password nem webhook_secret aqui: tudo vai para o HTML da página.
const SITE_COLUMNS =
  "id, client_id, name, url, blog_path, platform, public_key, webhook_url, indexnow_key, status, last_check_at, last_check_ok, last_check_message, client:clients(id, name)";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-[13px] font-semibold text-ink">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-3 pb-1">
        <p className="pt-0.5 text-[14.5px] font-medium text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

function Block({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      {title ? <p className="text-[13.5px] font-medium text-ink">{title}</p> : null}
      {children}
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[72ch] space-y-3 text-[14.5px] leading-relaxed text-text">{children}</div>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-sunken px-1 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>;
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const siteParam = typeof sp.site === "string" ? sp.site : null;
  const failedOnly = sp.entregas === "falhas";

  let deliveriesQuery = db()
    .from("deliveries")
    .select(
      "id, post_id, site_id, channel, event, ok, status_code, message, duration_ms, created_at, post:posts(id, title), site:sites(id, name, client_id, client:clients(name))",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (failedOnly) deliveriesQuery = deliveriesQuery.eq("ok", false);

  const [sitesRes, deliveriesRes] = await Promise.all([db().from("sites").select(SITE_COLUMNS).order("name"), deliveriesQuery]);

  const sites = ((sitesRes.data ?? []) as unknown as (IntegrationSite & { client: unknown })[])
    .map((s) => ({ ...s, client: one(s.client as IntegrationSite["client"] | IntegrationSite["client"][]) }))
    .sort((a, b) => (a.client?.name ?? "").localeCompare(b.client?.name ?? "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));

  const deliveries = ((deliveriesRes.data ?? []) as unknown as DeliveryRow[]).map((d) => {
    const site = one(d.site as DeliveryRow["site"] | DeliveryRow["site"][]);
    return { ...d, post: one(d.post as DeliveryRow["post"] | DeliveryRow["post"][]), site: site ? { ...site, client: one(site.client as never) } : null };
  }) as DeliveryRow[];

  const selected = sites.find((s) => s.id === siteParam) ?? sites[0] ?? null;
  const appUrl = env.appUrl;

  const deliveriesPanel = (
    <Panel
      title={<span id="entregas">Entregas recentes</span>}
      description="Últimos 50 envios para todos os sites, com o resultado de cada um."
      actions={<DeliveryFilter failedOnly={failedOnly} siteParam={siteParam} />}
    >
      {deliveriesRes.error ? (
        <p className="text-sm text-danger" role="alert">
          Não foi possível carregar as entregas: {deliveriesRes.error.message}
        </p>
      ) : (
        <DeliveryList rows={deliveries} failedOnly={failedOnly} />
      )}
    </Panel>
  );

  if (sitesRes.error) {
    return (
      <>
        <PageHeader title="Integrações" />
        <p className="text-sm text-danger" role="alert">
          Não foi possível carregar os sites: {sitesRes.error.message}. Recarregue a página.
        </p>
      </>
    );
  }

  if (!selected) {
    return (
      <>
        <PageHeader title="Integrações" description="Códigos prontos para ligar o blog de cada cliente ao OutBox CMS." />
        <div className="space-y-8">
          <EmptyState
            icon={<Plug className="size-6" aria-hidden />}
            title="Cadastre um site para gerar os códigos de integração"
            description="Cada site de cliente recebe uma chave pública. Com ela, os artigos aparecem no site OutBox, por script, WordPress ou webhook."
            action={
              <Link href="/clientes" className={buttonClass("primary")}>
                Ir para clientes e sites
              </Link>
            }
          />
          {deliveriesPanel}
        </div>
      </>
    );
  }

  const key = selected.public_key;
  const configHref = `/clientes/${selected.client_id}/sites/${selected.id}`;
  const exampleUrl = siteArticleUrl(selected, "como-escolher-o-melhor-armario");
  const siteHost = hostname(selected.url);
  const api = `${appUrl}/api/v1`;
  const keep: Record<string, string> = failedOnly ? { entregas: "falhas" } : {};
  const siteRoot = selected.url.replace(/\/+$/, "");
  const revalidateUrl = `${siteRoot}${S.REVALIDATE_PATH}`;
  const revalidateOk = (selected.webhook_url ?? "").replace(/\/+$/, "") === revalidateUrl;

  const tabs = [
    {
      id: "outbox",
      label: "Site OutBox (Next.js)",
      content: (
        <ol className="space-y-7">
          <Step n={1} title="Variáveis de ambiente do site">
            <Prose>
              <p>
                Sites feitos com o starter da OutBox só precisam destas 3 variáveis. Blog, páginas de artigo com SEO e JSON-LD, sitemap, llms.txt e
                o arquivo do IndexNow já vêm prontos no starter.
              </p>
            </Prose>
            <CopyField value={S.outboxEnvSnippet(appUrl, key)} multiline label="Copiar variáveis de ambiente" />
            <p className="text-[13.5px] text-muted">
              O valor de <Code>OUTBOX_WEBHOOK_SECRET</Code> fica na{" "}
              <Link href={configHref} className="font-medium text-ink underline underline-offset-4">
                página do site
              </Link>
              .
            </p>
          </Step>
          <Step n={2} title="Atualização instantânea">
            {revalidateOk ? (
              <Badge tone="ok">
                <StatusDot tone="ok" />
                Configurada neste site
              </Badge>
            ) : (
              <Badge tone="warn">
                <StatusDot tone="warn" />
                Ainda não configurada
              </Badge>
            )}
            <CopyField value={revalidateUrl} label="Copiar URL de atualização" />
            <p className="text-[13.5px] text-muted">
              {revalidateOk
                ? "A cada publicação o OutBox chama esta rota do site e o artigo aparece na hora."
                : "Na configuração do site, deixe este endereço em Atualização instantânea do site para os artigos aparecerem na hora."}{" "}
              {revalidateOk ? null : (
                <Link href={configHref} className="font-medium text-ink underline underline-offset-4">
                  Abrir configuração do site
                </Link>
              )}
            </p>
          </Step>
          <Step n={3} title="Publique e confira">
            <p className="text-[14px] text-muted">
              Depois do deploy, use Testar conexão na configuração do site e publique um artigo. Ele aparece em{" "}
              <Code>{`${siteRoot}${selected.blog_path}`}</Code> assim que a publicação termina.
            </p>
          </Step>
        </ol>
      ),
    },
    {
      id: "html",
      label: "Qualquer site (HTML)",
      content: (
        <div className="space-y-6">
          <Prose>
            <p>
              Cole no ponto da página onde o blog deve aparecer. Funciona em sites HTML, construtores de sites e landing pages. A lista de
              artigos, a paginação e o artigo completo aparecem sozinhos, com a fonte e as cores do próprio site.
            </p>
          </Prose>
          <CopyField value={S.embedSnippet(appUrl, key)} multiline label="Copiar código do blog" />
          <Block title="Opções">
            <ul className="space-y-1.5 text-[14px] text-text">
              <li>
                <Code>data-target</Code> seletor do elemento onde o blog aparece (padrão <Code>#outbox-blog</Code>)
              </li>
              <li>
                <Code>data-per-page</Code> artigos por página, de 1 a 50 (padrão 9)
              </li>
              <li>
                <Code>data-accent</Code> cor de destaque dos links e da categoria
              </li>
              <li>
                <Code>data-category</Code> mostra só uma categoria (nome ou slug)
              </li>
            </ul>
          </Block>
          <CopyField value={S.embedOptionsSnippet(appUrl, key)} multiline label="Copiar exemplo com opções" />
          <Prose>
            <p className="text-muted">
              O artigo abre na mesma página com <Code>?artigo=slug-do-artigo</Code>: o script ajusta título, descrição, link canônico e dados
              estruturados. Como o conteúdo é carregado por JavaScript, envie também o sitemap ao Google Search Console:
            </p>
          </Prose>
          <CopyField value={`${api}/sitemap.xml?key=${key}`} label="Copiar URL do sitemap" />
        </div>
      ),
    },
    {
      id: "nextjs",
      label: "Next.js / React",
      content: (
        <ol className="space-y-7">
          <Step n={1} title="Variáveis de ambiente do site">
            <CopyField value={S.nextEnvSnippet(appUrl, key)} multiline />
            <p className="text-[13.5px] text-muted">
              O segredo do webhook fica na{" "}
              <Link href={configHref} className="font-medium text-ink underline underline-offset-4">
                página do site
              </Link>
              .
            </p>
          </Step>
          <Step n={2} title="Cliente da API">
            <CopyField value={S.nextLibSnippet()} multiline />
          </Step>
          <Step n={3} title="Lista de artigos">
            <CopyField value={S.nextListPageSnippet(selected.blog_path)} multiline />
          </Step>
          <Step n={4} title="Página do artigo com SEO">
            <CopyField value={S.nextPostPageSnippet(selected.blog_path)} multiline />
          </Step>
          <Step n={5} title="Atualização instantânea por webhook">
            <CopyField value={S.nextWebhookSnippet(selected.blog_path)} multiline />
            <p className="text-[13.5px] text-muted">
              Depois do deploy, preencha a URL do webhook na{" "}
              <Link href={configHref} className="font-medium text-ink underline underline-offset-4">
                configuração do site
              </Link>{" "}
              com <Code>{revalidateUrl}</Code>. A cada publicação o OutBox chama essa rota e a página é atualizada na hora.
            </p>
          </Step>
        </ol>
      ),
    },
    {
      id: "wordpress",
      label: "WordPress",
      content: (
        <div className="space-y-7">
          <ol className="space-y-6">
            <Step n={1} title="No painel do WordPress do cliente, abra Usuários → Perfil">
              <p className="text-[14px] text-muted">Use um usuário com papel Editor ou Administrador.</p>
            </Step>
            <Step n={2} title="Crie uma senha de aplicativo">
              <p className="text-[14px] text-muted">
                Em Senhas de aplicativo, digite um nome como <Code>OutBox CMS</Code> e clique em Adicionar nova senha de aplicativo. Copie a senha
                gerada (os espaços podem ficar, o CMS remove).
              </p>
            </Step>
            <Step n={3} title="Cole na configuração do site no OutBox">
              <p className="text-[14px] text-muted">
                Escolha a plataforma WordPress e informe a URL do WordPress, o nome de usuário e a senha de aplicativo. Depois clique em Testar
                conexão.
              </p>
              <Link href={configHref} className={buttonClass("secondary", "sm")}>
                <Settings2 className="size-4" aria-hidden />
                Abrir configuração do site
              </Link>
            </Step>
          </ol>
          <Panel className="bg-sunken" bodyClassName="p-4">
            <div className="space-y-2 text-[14px] text-text">
              <p className="font-medium text-ink">O que é enviado</p>
              <p className="text-muted">
                Título, conteúdo, resumo, slug, categoria, tags e imagem destacada. O status inicial segue o padrão do site (publicado ou rascunho).
                Despublicar no OutBox só volta o post para rascunho no WordPress, sem apagar nada.
              </p>
              <p className="pt-2 font-medium text-ink">Se o teste falhar</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>Links permanentes não podem estar em Simples (Configurações → Links permanentes).</li>
                <li>Plugins de segurança ou firewall podem bloquear a API REST ou as senhas de aplicativo.</li>
                <li>O site precisa de HTTPS para as senhas de aplicativo funcionarem.</li>
              </ul>
            </div>
          </Panel>
        </div>
      ),
    },
    {
      id: "webhook",
      label: "Webhook",
      content: (
        <div className="space-y-6">
          <Prose>
            <p>
              A cada publicação, atualização ou despublicação, o OutBox envia um <Code>POST</Code> em JSON para a URL configurada no site, assinado
              com HMAC-SHA256 usando o segredo do site. Responda com status 2xx em até 10 s; em erro de rede ou 5xx, reenviamos até 2 vezes.
            </p>
            <p className="text-muted">
              Eventos: <Code>publish</Code>, <Code>update</Code>, <Code>unpublish</Code> e <Code>test</Code> (botão Testar conexão). Se a resposta
              trouxer <Code>{`{ "url": "https://…" }`}</Code>, ela vira o link do artigo no CMS. Serve para Zapier, n8n, Make ou qualquer backend.
            </p>
          </Prose>
          <Block title="Exemplo de requisição">
            <CopyField value={S.webhookPayloadSnippet(selected, exampleUrl)} multiline />
          </Block>
          <Block title="Validar a assinatura em Node.js">
            <CopyField value={S.webhookNodeSnippet()} multiline />
          </Block>
          <Block title="Validar a assinatura em PHP">
            <CopyField value={S.webhookPhpSnippet()} multiline />
          </Block>
          <p className="text-[13.5px] text-muted">
            O segredo e a URL do webhook ficam na{" "}
            <Link href={configHref} className="font-medium text-ink underline underline-offset-4">
              página do site
            </Link>
            .
          </p>
        </div>
      ),
    },
    {
      id: "api",
      label: "API",
      content: (
        <div className="space-y-6">
          <Prose>
            <p>
              API pública e somente leitura, liberada para qualquer origem (CORS). Autentique com a chave pública do site em <Code>?key=</Code>, no
              cabeçalho <Code>x-outbox-key</Code> ou em <Code>Authorization: Bearer</Code>. Só aparecem artigos publicados neste site.
            </p>
            <p className="text-muted">As respostas ficam até 15 s em cache na CDN, então uma publicação aparece quase na hora.</p>
          </Prose>
          <Block title="URL base">
            <CopyField value={api} />
          </Block>
          <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead className="bg-sunken text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Endpoint
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Retorna
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  [
                    "GET /posts",
                    "Lista paginada: data (com answer_summary e author_profile), meta (page, per_page, total, total_pages) e site. Parâmetros page, per_page (até 50), category, tag, q.",
                  ],
                  [
                    "GET /posts/{slug}",
                    "Artigo completo: content_html, answer_summary, key_takeaways, faq, sources, content_type, author_profile, seo e json_ld (@graph).",
                  ],
                  ["GET /categories", "Categorias e tags dos artigos no ar, com contagem."],
                  ["GET /site", "Dados do site e da empresa (organization), indexnow_key e json_ld da home."],
                  ["GET /llms.txt", "Resumo da empresa e dos 50 artigos mais recentes para IAs (llmstxt.org)."],
                  ["GET /llms-full.txt", "Texto completo dos 30 artigos mais recentes, em markdown."],
                  ["GET /sitemap.xml", "Sitemap XML com o blog e todos os artigos."],
                  ["GET /feed.xml", "Feed RSS 2.0 com os 30 artigos mais recentes."],
                  ["POST /posts/{slug}/view", "Registra uma visualização (conta nas estatísticas do CMS)."],
                ].map(([endpoint, desc]) => (
                  <tr key={endpoint}>
                    <td className="px-3 py-2.5 align-top font-mono text-[12.5px] whitespace-nowrap text-ink">{endpoint}</td>
                    <td className="px-3 py-2.5 text-text">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4">
            {S.curlSnippets(appUrl, key).map((c) => (
              <Block key={c.title} title={c.title}>
                <CopyField value={c.code} multiline />
              </Block>
            ))}
          </div>
          <p className="text-[13.5px] text-muted">
            Erros voltam em JSON como <Code>{`{ "error": "mensagem" }`}</Code> com status 401 (chave ausente ou inválida), 403 (site pausado) ou 404
            (artigo não encontrado).
          </p>
        </div>
      ),
    },
  ];

  const defaultTab = selected.platform === "wordpress" ? "wordpress" : selected.platform === "webhook" ? "webhook" : "outbox";

  return (
    <>
      <PageHeader
        title="Integrações"
        description="Escolha o site e copie o código pronto para a plataforma dele. Cada artigo publicado aparece no blog do cliente na hora."
      />
      <div className="space-y-8">
        <Panel>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <SitePicker
              sites={sites.map((s) => ({ id: s.id, name: s.name, url: s.url, clientName: s.client?.name ?? "Sem cliente" }))}
              value={selected.id}
              keep={keep}
            />
            <Link href={configHref} className={buttonClass("secondary", "md")}>
              <Settings2 className="size-4" aria-hidden />
              Configurar site
            </Link>
          </div>

          <div className="mt-6 grid gap-6 border-t border-line pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2.5 text-[14px]">
              <dt className="text-muted">Endereço</dt>
              <dd className="min-w-0">
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-ink hover:underline hover:underline-offset-4"
                >
                  <span className="truncate">{siteHost}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              </dd>
              <dt className="text-muted">Plataforma</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{PLATFORM[selected.platform].label}</span>
                {selected.status === "paused" ? (
                  <Badge tone="warn">
                    <StatusDot tone="warn" />
                    Pausado
                  </Badge>
                ) : null}
              </dd>
              <dt className="text-muted">Conexão</dt>
              <dd className="min-w-0">
                {selected.last_check_at ? (
                  <div className="space-y-1">
                    <Badge tone={selected.last_check_ok ? "ok" : "danger"}>
                      <StatusDot tone={selected.last_check_ok ? "ok" : "danger"} />
                      {selected.last_check_ok ? "Funcionando" : "Com erro"}
                    </Badge>
                    <p className="text-[13px] text-muted">
                      Testada em {formatDateTime(selected.last_check_at)}
                      {selected.last_check_message ? <span className="block">{selected.last_check_message}</span> : null}
                    </p>
                  </div>
                ) : (
                  <span className="text-muted">Ainda não testada. Use Testar conexão na configuração do site.</span>
                )}
              </dd>
            </dl>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-ink">Chave pública</p>
              <CopyField value={key} label="Copiar chave pública" />
              <p className="text-[13px] text-muted">Identifica o site na Content API e no script. Pode ficar no código do site, não é secreta.</p>
            </div>
          </div>
        </Panel>

        <Panel title="Como integrar" description={`Códigos já preenchidos para ${selected.name}.`}>
          <IntegrationTabs key={selected.id} tabs={tabs} defaultTab={defaultTab} />
        </Panel>

        <Panel
          title="GEO: ser citado pelas IAs"
          description="O que o CMS entrega para o site aparecer nas respostas do ChatGPT, Gemini, Perplexity e Google AI Overviews."
        >
          <div className="space-y-6">
            <Prose>
              <p>
                Cada artigo publicado leva resposta direta, pontos principais, perguntas frequentes e fontes, além de dados estruturados com o
                artigo, o FAQ, a empresa e o autor com credenciais. Os dados da empresa e do especialista vêm do cadastro do cliente.
              </p>
            </Prose>
            <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line">
              <table className="w-full min-w-[560px] text-left text-[13.5px]">
                <thead className="bg-sunken text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Recurso
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Onde está
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[
                    ["llms.txt", "GET /llms.txt: empresa, serviços, artigos e contato. O site OutBox serve em /llms.txt."],
                    ["llms-full.txt", "GET /llms-full.txt: os 30 artigos mais recentes em texto completo. O site OutBox serve em /llms-full.txt."],
                    ["JSON-LD", "Campo json_ld de GET /posts/{slug} (artigo, FAQ, empresa, autor, breadcrumbs) e de GET /site (empresa e site, para a home)."],
                    ["IndexNow", "Aviso automático ao Bing e aos buscadores parceiros a cada publicação, atualização ou despublicação."],
                  ].map(([name, desc]) => (
                    <tr key={name}>
                      <td className="px-3 py-2.5 align-top font-mono text-[12.5px] whitespace-nowrap text-ink">{name}</td>
                      <td className="px-3 py-2.5 text-text">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Block title="llms.txt deste site">
                <CopyField value={`${api}/llms.txt?key=${key}`} label="Copiar URL do llms.txt" />
              </Block>
              <Block title="llms-full.txt deste site">
                <CopyField value={`${api}/llms-full.txt?key=${key}`} label="Copiar URL do llms-full.txt" />
              </Block>
            </div>
            {selected.indexnow_key ? (
              <Block title="Arquivo de verificação do IndexNow">
                <CopyField value={`${siteRoot}/${selected.indexnow_key}.txt`} label="Copiar endereço do arquivo" />
                <p className="text-[13.5px] text-muted">
                  O arquivo precisa responder só a chave <Code>{selected.indexnow_key}</Code>. O site OutBox faz isso sozinho; em outros sites,
                  crie o arquivo na raiz.
                </p>
              </Block>
            ) : null}
            <Block title="robots.txt recomendado">
              <CopyField value={S.robotsSnippet(selected.url)} multiline label="Copiar robots.txt" />
              <p className="text-[13.5px] text-muted">
                Libera os robôs de busca e de IA para lerem o site. Bloquear GPTBot, PerplexityBot ou ClaudeBot tira o site das respostas desses
                assistentes.
              </p>
            </Block>
          </div>
        </Panel>

        {deliveriesPanel}
      </div>
    </>
  );
}
