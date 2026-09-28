import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { igConfigured, igRedirectUri } from "@/lib/instagram/oauth";
import { igConnectLink } from "@/lib/instagram/link";
import { PageHeader } from "@/components/ui/panel";
import { IgBoard, type IgArticle, type IgClient, type IgItem } from "@/components/instagram/ig-board";

export const metadata: Metadata = { title: "Instagram" };

export default async function InstagramPage() {
  await requireUser();
  const configured = igConfigured();

  const [clientsRes, accountsRes, postsRes, itemsRes] = await Promise.all([
    db().from("clients").select("id, name").neq("status", "archived").order("name"),
    db().from("ig_accounts").select("client_id, username"),
    db()
      .from("post_sites")
      .select("post_id, posts!inner(id, title), sites!inner(client_id)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(200),
    db().from("ig_posts").select("id, kind, slides, caption, status, permalink, error, feedback, created_at, clients(name)").order("created_at", { ascending: false }).limit(60),
  ]);

  const accounts = new Map(((accountsRes.data ?? []) as { client_id: string; username: string | null }[]).map((a) => [a.client_id, a.username]));
  const clients: IgClient[] = ((clientsRes.data ?? []) as { id: string; name: string }[])
    .map((c) => ({ id: c.id, name: c.name, username: accounts.get(c.id) ?? null, connected: accounts.has(c.id), link: igConnectLink(c.id) }))
    .sort((a, b) => Number(b.connected) - Number(a.connected));

  type P = { posts: { id: string; title: string } | { id: string; title: string }[]; sites: { client_id: string } | { client_id: string }[] };
  const seen = new Set<string>();
  const articles: IgArticle[] = ((postsRes.data ?? []) as unknown as P[])
    .map((r) => {
      const p = Array.isArray(r.posts) ? r.posts[0] : r.posts;
      const s = Array.isArray(r.sites) ? r.sites[0] : r.sites;
      return { id: p.id, title: p.title, clientId: s.client_id };
    })
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));

  type Row = Omit<IgItem, "clientName"> & { clients: { name: string } | { name: string }[] | null };
  const items: IgItem[] = ((itemsRes.data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    clientName: (Array.isArray(r.clients) ? r.clients[0]?.name : r.clients?.name) ?? "Cliente removido",
  }));

  return (
    <>
      <PageHeader
        title="Instagram"
        description="Carrosséis, legendas com hashtags e stories feitos a partir dos artigos, com as cores de cada cliente, e publicados direto na conta dele."
      />
      {!configured ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">Falta configurar o app da Meta</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Crie o app no Meta for Developers e cole o ID e a chave secreta do app do Instagram em{" "}
            <Link href="/painel" className="underline underline-offset-2 hover:text-ink">
              Painel admin → Instagram
            </Link>
            . No app, use este endereço de redirecionamento:
          </p>
          <code className="mt-3 block rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 font-mono text-[13px] text-text">{igRedirectUri()}</code>
        </section>
      ) : (
        <IgBoard clients={clients} articles={articles} items={items} />
      )}
    </>
  );
}
