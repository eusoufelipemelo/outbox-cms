import type { Metadata } from "next";
import Link from "next/link";
import { FilePen, Plus, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import {
  countPostsByStatus,
  listClientOptions,
  listPosts,
  POSTS_PAGE_SIZE,
  type PostListFilter,
  type PostListItem,
} from "@/lib/data/posts";
import { buttonClass } from "@/components/ui/button";
import { PostStatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/panel";
import { cn, formatDateTime, hostname, relativeTime } from "@/lib/utils";
import { ArticleFilters } from "./_components/filters";
import { listArticleGroups, type ArticleGroup } from "@/lib/data/post-groups";
import { ChevronDown, List, Users } from "lucide-react";

export const metadata: Metadata = { title: "Artigos" };

const TABS: { key: string; label: string; status: PostListFilter; empty: string }[] = [
  { key: "todos", label: "Todos", status: "all", empty: "Nenhum artigo por aqui." },
  { key: "rascunhos", label: "Rascunhos", status: "draft", empty: "Nenhum rascunho em andamento." },
  { key: "agendados", label: "Agendados", status: "scheduled", empty: "Nenhum artigo agendado." },
  { key: "publicados", label: "Publicados", status: "published", empty: "Nenhum artigo publicado ainda." },
  { key: "arquivados", label: "Arquivados", status: "archived", empty: "Nenhum artigo arquivado." },
];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function href(params: { status?: string; q?: string; cliente?: string; pagina?: number; vista?: string }) {
  const sp = new URLSearchParams();
  if (params.vista) sp.set("vista", params.vista);
  if (params.status && params.status !== "todos") sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.cliente) sp.set("cliente", params.cliente);
  if (params.pagina && params.pagina > 1) sp.set("pagina", String(params.pagina));
  const qs = sp.toString();
  return qs ? `/artigos?${qs}` : "/artigos";
}

function Dot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full border border-black/10 dark:border-white/20"
      style={{ backgroundColor: color || "var(--color-line-strong)" }}
    />
  );
}

const pubLabel = { pending: "aguardando", published: "no ar", failed: "falhou", unpublished: "despublicado" } as const;

function Destinations({ items }: { items: PostListItem["destinations"] }) {
  if (!items.length) return <span className="text-[13px] text-faint">Sem destino</span>;
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Destinos">
      {shown.map((d) => (
        <li
          key={d.siteId}
          title={`${d.clientName}: ${pubLabel[d.status]}`}
          className={cn(
            "inline-flex max-w-[180px] items-center gap-1.5 rounded-[var(--radius-chip)] border px-2 py-0.5 text-[12.5px]",
            d.status === "published" ? "border-line-strong bg-surface text-ink" : "border-line bg-sunken text-muted",
            d.status === "failed" && "border-danger/30 text-danger",
          )}
        >
          <Dot color={d.clientColor} />
          <span className="truncate">{hostname(d.url)}</span>
          <span className="sr-only">, {pubLabel[d.status]}</span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="inline-flex items-center rounded-[var(--radius-chip)] border border-line bg-sunken px-2 py-0.5 text-[12.5px] text-muted">
          +{rest}
          <span className="sr-only"> {rest === 1 ? "site" : "sites"}</span>
        </li>
      ) : null}
    </ul>
  );
}

function Row({ post }: { post: PostListItem }) {
  return (
    <li>
      <Link
        href={`/artigos/${post.id}`}
        className="group grid gap-x-6 gap-y-3 px-4 py-4 transition-colors hover:bg-sunken sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_130px_150px] md:items-center"
      >
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
            {post.title || <span className="text-muted italic">Sem título</span>}
          </p>
          {post.snippet ? <p className="mt-0.5 line-clamp-2 text-sm text-muted md:line-clamp-1">{post.snippet}</p> : null}
        </div>
        <Destinations items={post.destinations} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:block">
          <PostStatusBadge status={post.status} />
          {post.status === "scheduled" && post.scheduledAt ? (
            <p className="text-[12.5px] text-muted md:mt-1">{formatDateTime(post.scheduledAt)}</p>
          ) : null}
          <p className="text-[12.5px] text-muted md:hidden">
            Atualizado {relativeTime(post.updatedAt)}
            {post.author ? `, por ${post.author}` : ""}
          </p>
        </div>
        <div className="hidden min-w-0 text-[13px] md:block">
          <p className="truncate text-text">{post.author ?? "Equipe"}</p>
          <p className="text-muted">
            <time dateTime={post.updatedAt}>{relativeTime(post.updatedAt)}</time>
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function ArticlesPage({ searchParams }: PageProps<"/artigos">) {
  await requireUser();
  const sp = await searchParams;
  // aceita a chave da aba (?status=rascunhos) e o status do banco (?status=draft), usado por outros módulos
  const statusParam = str(sp.status);
  const tab = TABS.find((t) => t.key === statusParam || t.status === statusParam) ?? TABS[0];
  const q = str(sp.q).slice(0, 120);
  const clienteRaw = str(sp.cliente);
  const cliente = GUID.test(clienteRaw) ? clienteRaw : "";
  const page = Math.max(1, Number.parseInt(str(sp.pagina), 10) || 1);
  // visão por cliente é a padrão; com um cliente escolhido, a lista dele
  const view = cliente ? "lista" : str(sp.vista) === "lista" ? "lista" : "clientes";

  const [{ posts, total }, counts, clients, groups] = await Promise.all([
    view === "lista" ? listPosts({ status: tab.status, q, clientId: cliente || undefined, page }) : Promise.resolve({ posts: [] as PostListItem[], total: 0 }),
    countPostsByStatus(),
    listClientOptions(),
    view === "clientes" ? listArticleGroups(tab.status, q) : Promise.resolve([] as ArticleGroup[]),
  ]);

  const nothingYet = counts.all + counts.archived === 0;
  const filtered = Boolean(q || cliente);
  const pages = Math.ceil(total / POSTS_PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Artigos"
        description="Escreva uma vez e publique no blog de cada cliente."
        actions={
          <>
            <Link href="/artigos/novo?ia=1" prefetch={false} className={buttonClass("secondary", "md")}>
              <Sparkles className="size-4" aria-hidden />
              Criar com IA
            </Link>
            <Link href="/artigos/novo" prefetch={false} className={buttonClass("primary", "md")}>
              <Plus className="size-4" aria-hidden />
              Novo artigo
            </Link>
          </>
        }
      />

      {nothingYet ? (
        <EmptyState
          icon={<FilePen className="size-7" aria-hidden />}
          title="Nenhum artigo ainda"
          description="Escreva o artigo uma vez, escolha os sites dos clientes e publique em todos de uma vez."
          action={
            <Link href="/artigos/novo" prefetch={false} className={buttonClass("primary", "md")}>
              Escrever o primeiro artigo
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <nav aria-label="Filtrar por status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex min-w-max gap-1 border-b border-line">
              {TABS.map((t) => {
                const active = t.key === tab.key;
                return (
                  <li key={t.key}>
                    <Link
                      href={href({ status: t.key, q, cliente, vista: view === "lista" && !cliente ? "lista" : undefined })}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex h-11 items-center gap-2 px-3 text-sm transition-colors",
                        active ? "font-semibold text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {t.label}
                      <span className={cn("rounded-[var(--radius-chip)] px-1.5 text-[12px] tabular-nums", active ? "bg-ink text-on-ink" : "bg-sunken text-muted")}>
                        {counts[t.status]}
                      </span>
                      {active ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-[3px] rounded-t bg-brand" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex flex-wrap items-start gap-3">
            <div className="inline-flex rounded-[var(--radius-control)] border border-line-strong bg-surface p-0.5" role="group" aria-label="Modo de visualização">
              <Link
                href={href({ status: tab.key, q })}
                aria-current={view === "clientes" ? "page" : undefined}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm", view === "clientes" ? "bg-ink font-medium text-on-ink" : "text-muted hover:text-ink")}
              >
                <Users className="size-4" aria-hidden />
                Por cliente
              </Link>
              <Link
                href={href({ status: tab.key, q, vista: "lista" })}
                aria-current={view === "lista" ? "page" : undefined}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-sm", view === "lista" ? "bg-ink font-medium text-on-ink" : "text-muted hover:text-ink")}
              >
                <List className="size-4" aria-hidden />
                Lista
              </Link>
            </div>
            <div className="min-w-0 flex-1">
              <ArticleFilters status={tab.key} q={q} clientId={cliente} clients={clients} />
            </div>
          </div>

          {view === "clientes" ? (
            <Groups groups={groups} tabKey={tab.key} />
          ) : posts.length === 0 ? (
            filtered ? (
              <EmptyState
                title="Nenhum artigo encontrado"
                description="Nenhum artigo combina com a busca ou o cliente escolhido."
                action={
                  <Link href={href({ status: tab.key })} className={buttonClass("secondary", "md")}>
                    Limpar filtros
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title={tab.empty}
                description="Comece um artigo novo e escolha em quais sites ele vai ao ar."
                action={
                  <Link href="/artigos/novo" prefetch={false} className={buttonClass("primary", "md")}>
                    Escrever artigo
                  </Link>
                }
              />
            )
          ) : (
            <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface" aria-label="Lista de artigos">
              <div
                aria-hidden
                className="hidden grid-cols-[minmax(0,1fr)_minmax(0,220px)_130px_150px] gap-x-6 border-b border-line px-5 py-2.5 text-[12.5px] font-medium text-muted md:grid"
              >
                <span>Artigo</span>
                <span>Destinos</span>
                <span>Status</span>
                <span>Autor e edição</span>
              </div>
              <ul className="divide-y divide-line">
                {posts.map((post) => (
                  <Row key={post.id} post={post} />
                ))}
              </ul>
            </section>
          )}

          {view === "lista" && pages > 1 ? (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm text-muted">
              <span>
                Página {page} de {pages}
              </span>
              <span className="flex gap-2">
                {page > 1 ? (
                  <Link href={href({ status: tab.key, q, cliente, pagina: page - 1 })} className={buttonClass("secondary", "md")}>
                    Anterior
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link href={href({ status: tab.key, q, cliente, pagina: page + 1 })} className={buttonClass("secondary", "md")}>
                    Próxima
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </div>
      )}
    </>
  );
}

const STATUS_SHORT: { key: PostListItem["status"]; label: string; cls: string }[] = [
  { key: "draft", label: "rascunho", cls: "bg-sunken text-muted" },
  { key: "scheduled", label: "agendado", cls: "bg-info-soft text-info" },
  { key: "published", label: "no ar", cls: "bg-ok-soft text-ok" },
  { key: "archived", label: "arquivado", cls: "bg-warn-soft text-warn" },
];

/** Um grupo recolhido por cliente: contagem por status e os artigos mais recentes ao abrir. */
function Groups({ groups, tabKey }: { groups: ArticleGroup[]; tabKey: string }) {
  if (!groups.length) {
    return <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-8 text-center text-sm text-muted">Nenhum artigo nesta aba.</p>;
  }
  return (
    <ul className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface">
      {groups.map((g) => (
        <li key={g.clientId ?? "_sem"} className="border-b border-line last:border-b-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-sunken sm:px-5 [&::-webkit-details-marker]:hidden">
              <Dot color={g.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{g.name}</span>
                <span className="block text-[12.5px] text-muted">
                  {g.total} {g.total === 1 ? "artigo" : "artigos"}, último movimento {relativeTime(g.lastUpdate)}
                </span>
              </span>
              <span className="hidden flex-wrap justify-end gap-1 sm:flex">
                {STATUS_SHORT.filter((st) => g.counts[st.key]).map((st) => (
                  <span key={st.key} className={cn("rounded-[var(--radius-chip)] px-2 py-0.5 text-[12px] tabular-nums", st.cls)}>
                    {g.counts[st.key]} {st.label}
                  </span>
                ))}
              </span>
              <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="divide-y divide-line border-t border-line bg-sunken/40">
              {g.posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/artigos/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken sm:pl-10 sm:pr-5">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.title || <span className="text-muted italic">Sem título</span>}</span>
                    <PostStatusBadge status={p.status} />
                    <span className="hidden w-28 shrink-0 text-right text-[12.5px] text-muted sm:block">{relativeTime(p.updatedAt)}</span>
                  </Link>
                </li>
              ))}
              {g.clientId && g.total > g.posts.length ? (
                <li>
                  <Link href={href({ status: tabKey, cliente: g.clientId })} className="block px-4 py-2.5 text-[13.5px] font-medium text-brand-ink hover:bg-sunken sm:pl-10">
                    Ver todos os {g.total} artigos de {g.name}
                  </Link>
                </li>
              ) : null}
            </ul>
          </details>
        </li>
      ))}
    </ul>
  );
}
