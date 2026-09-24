import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { gbpStatus, listGbpLocations, listGbpPosts } from "@/lib/data/gbp";
import { parseUnits } from "@/lib/units";
import { PageHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { GbpConnect } from "@/components/gbp/gbp-connect";
import { LocationCard } from "@/components/gbp/location-card";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Google Empresas" };

const ERRORS: Record<string, string> = {
  configuracao: "Falta o Client ID e o Client secret do OAuth no Painel admin.",
  negado: "A conexão foi cancelada na tela do Google.",
  estado: "A conexão expirou ou veio de outra aba. Clique em Conectar de novo.",
  token: "O Google não devolveu a autorização. Confira o Client ID, o secret e o endereço de retorno no Google Cloud.",
};

export default async function GoogleEmpresasPage({ searchParams }: PageProps<"/google-empresas">) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = gbpStatus();
  const [locations, gbpPosts, clientsRes, postsRes] = await Promise.all([
    status.connected ? listGbpLocations() : Promise.resolve([]),
    status.connected ? listGbpPosts() : Promise.resolve([]),
    db().from("clients").select("id, name, units").neq("status", "archived").order("name"),
    db()
      .from("post_sites")
      .select("post_id, posts!inner(id, title), sites!inner(client_id)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(300),
  ]);
  const clients = ((clientsRes.data ?? []) as { id: string; name: string; units: unknown }[]).map((c) => ({
    id: c.id,
    name: c.name,
    units: parseUnits(c.units).map((u) => ({ id: u.id, label: u.label })),
  }));
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
  const unlinked = locations.filter((l) => !l.client_id).length;

  return (
    <>
      <PageHeader
        title="Google Empresas"
        description="Os perfis dos clientes no Google em um lugar só: publicar artigos como novidades, responder avaliações com ajuda da IA e acompanhar visualizações, ligações e rotas."
        actions={status.configured ? <GbpConnect connected={status.connected} email={status.email} isAdmin={user.role === "admin"} /> : null}
      />

      {error ? <p className="mb-6 rounded-[var(--radius-control)] bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      {sp.conectado ? <p className="mb-6 rounded-[var(--radius-control)] bg-ok-soft px-4 py-3 text-sm text-ok">Conta Google conectada. Agora clique em Buscar perfis no Google.</p> : null}

      {!status.configured ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">Falta configurar o acesso</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Crie o cliente OAuth no Google Cloud e cole o Client ID e o Client secret em{" "}
            <Link href="/painel" className="underline underline-offset-2 hover:text-ink">
              Painel admin → Google Empresas
            </Link>
            . No Google Cloud, use este endereço de retorno autorizado:
          </p>
          <code className="mt-3 block rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 font-mono text-[13px] text-text">{status.redirectUri}</code>
        </section>
      ) : !status.connected ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">Conecte a conta Google da OutBox</h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted">
            Use a conta que é administradora dos perfis dos clientes no Google Empresas. A autorização vale até ser desconectada.
          </p>
        </section>
      ) : locations.length === 0 ? (
        <section className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-8">
          <p className="text-[15px] font-semibold text-ink">Nenhum perfil ainda</p>
          <p className="mt-1 text-sm text-muted">
            Clique em Buscar perfis no Google. Aparecem aqui todos os perfis que a conta da OutBox administra, e os que têm o site de um cliente já entram ligados a ele.
          </p>
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="info">{locations.length} perfil(is)</Badge>
            {unlinked ? <Badge tone="warn">{unlinked} sem cliente ligado</Badge> : null}
          </div>
          <ul className="space-y-3">
            {locations.map((loc) => (
              <LocationCard key={loc.id} loc={loc} clients={clients} posts={posts} />
            ))}
          </ul>
        </>
      )}

      {gbpPosts.length ? (
        <section className="mt-10">
          <h2 className="mb-3 text-[17px] font-semibold text-ink">Publicações enviadas ao Google</h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {gbpPosts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Badge tone={p.status === "sent" ? "ok" : "danger"}>{p.status === "sent" ? "Publicado" : "Falhou"}</Badge>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{p.article}</span>
                <span className="text-[13px] text-muted">{p.location}</span>
                <span className="text-[12.5px] text-faint">{formatDateTime(p.created_at)}</span>
                {p.error ? <p className="w-full text-[13px] text-muted">{p.error}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
