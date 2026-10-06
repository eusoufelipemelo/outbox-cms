import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { liStatus, listLiPages, listLiPosts } from "@/lib/data/linkedin";
import { postUrl } from "@/lib/linkedin/api";
import { PageHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { LiConnect } from "@/components/linkedin/li-connect";
import { LiPageCard } from "@/components/linkedin/page-card";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "LinkedIn" };

const ERRORS: Record<string, string> = {
  configuracao: "Falta o Client ID e o Client Secret da LinkedIn no Painel admin.",
  negado: "A conexão foi cancelada na tela da LinkedIn.",
  escopo: "A LinkedIn ainda não liberou a permissão de publicar. Confira se o Community Management API já foi aprovado no app.",
  estado: "A conexão expirou ou veio de outra aba. Clique em Conectar LinkedIn de novo.",
  token: "A LinkedIn não devolveu a autorização. Confira o Client ID, o Client Secret e o endereço de retorno no app.",
};

export default async function LinkedInPage({ searchParams }: PageProps<"/linkedin">) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = liStatus();
  const [pages, liPosts, clientsRes, postsRes] = await Promise.all([
    status.connected ? listLiPages() : Promise.resolve([]),
    status.connected ? listLiPosts() : Promise.resolve([]),
    db().from("clients").select("id, name").neq("status", "archived").order("name"),
    db()
      .from("post_sites")
      .select("post_id, posts!inner(id, title), sites!inner(client_id)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(300),
  ]);
  const clients = (clientsRes.data ?? []) as { id: string; name: string }[];
  type P = { posts: { id: string; title: string } | { id: string; title: string }[]; sites: { client_id: string } | { client_id: string }[] };
  const seen = new Set<string>();
  const posts = ((postsRes.data ?? []) as unknown as P[])
    .map((r) => {
      const p = Array.isArray(r.posts) ? r.posts[0] : r.posts;
      const s = Array.isArray(r.sites) ? r.sites[0] : r.sites;
      return { id: p.id, title: p.title, client_id: s.client_id };
    })
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  const error = typeof sp.erro === "string" ? ERRORS[sp.erro] : null;
  const unlinked = pages.filter((p) => !p.client_id).length;

  return (
    <>
      <PageHeader
        title="LinkedIn"
        description="As páginas de empresa dos clientes: cada artigo aprovado vira post com texto adaptado, capa e link para o blog."
        actions={status.configured ? <LiConnect connected={status.connected} name={status.name} isAdmin={user.role === "admin"} /> : null}
      />

      {error ? <p className="mb-6 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      {sp.conectado ? <p className="mb-6 rounded-[var(--radius-control)] bg-ok-soft px-4 py-3 text-sm text-ok">LinkedIn conectada. Agora clique em Buscar páginas.</p> : null}
      {status.expiresSoon && status.expiresAt ? (
        <p className="mb-6 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-warn">
          A autorização da LinkedIn vence em {formatDate(status.expiresAt)}. {status.renewable ? "" : "Conecte de novo antes disso para as publicações não pararem."}
        </p>
      ) : null}

      {!status.configured ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">Falta configurar o acesso</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Crie o app em linkedin.com/developers, peça o Community Management API e cole o Client ID e o Client Secret em{" "}
            <Link href="/painel" className="underline underline-offset-2 hover:text-ink">
              Painel admin → LinkedIn
            </Link>
            . No app, na aba Auth, use este endereço de retorno:
          </p>
          <code className="mt-3 block rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 font-mono text-[13px] text-text">{status.redirectUri}</code>
        </section>
      ) : !status.connected ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">Conecte a conta da LinkedIn</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Use a conta que é administradora das páginas dos clientes. Uma conexão vale para todas elas. Para incluir um cliente, ele adiciona essa conta como
            administradora da página da empresa dele.
          </p>
        </section>
      ) : pages.length === 0 ? (
        <section className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-8">
          <p className="text-[15px] font-semibold text-ink">Nenhuma página ainda</p>
          <p className="mt-1 text-sm text-muted">
            Clique em Buscar páginas. Aparecem aqui todas as páginas de empresa que a conta administra, e as que têm o site de um cliente já entram ligadas a ele.
          </p>
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="info">{pages.length} página(s)</Badge>
            {unlinked ? <Badge tone="warn">{unlinked} sem cliente ligado</Badge> : null}
          </div>
          <ul className="space-y-3">
            {pages.map((page) => (
              <LiPageCard key={page.id} page={page} clients={clients} posts={posts} />
            ))}
          </ul>
        </>
      )}

      {liPosts.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-[17px] font-semibold text-ink">Posts enviados à LinkedIn</h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {liPosts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Badge tone={p.status === "sent" ? "ok" : "danger"}>{p.status === "sent" ? "Publicado" : "Falhou"}</Badge>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.article}</span>
                <span className="text-[13px] text-muted">{p.page}</span>
                <span className="text-[12.5px] text-faint">{formatDateTime(p.created_at)}</span>
                {p.urn ? (
                  <a href={postUrl(p.urn)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                    Ver post
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
                {p.error ? <p className="w-full text-[13px] text-muted">{p.error}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
