"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, ExternalLink, Megaphone, MessageSquare, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { cn, formatDate } from "@/lib/utils";
import { linkLocation, loadPerformance, loadReviews, publishToGbp, sendReply, suggestReply, type ReviewItem } from "@/lib/data/gbp-actions";
import type { GbpLocationRow } from "@/lib/data/gbp";
import type { GbpMetrics } from "@/lib/google/gbp";

type ClientOpt = { id: string; name: string; units: { id: string; label: string }[] };
type PostOpt = { id: string; title: string; client_id: string };

export function LocationCard({ loc, clients, posts }: { loc: GbpLocationRow; clients: ClientOpt[]; posts: PostOpt[] }) {
  const [tab, setTab] = useState<"reviews" | "metrics" | "post" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [reviews, setReviews] = useState<{ reviews: ReviewItem[]; average: number | null; total: number } | null>(null);
  const [metrics, setMetrics] = useState<GbpMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [postId, setPostId] = useState("");

  const client = clients.find((c) => c.id === loc.client_id);
  const clientPosts = posts.filter((p) => p.client_id === loc.client_id);

  const open = (next: "reviews" | "metrics" | "post") => {
    setTab((t) => (t === next ? null : next));
    setError(null);
    if (next === "reviews" && !reviews)
      start(async () => {
        const r = await loadReviews(loc.id);
        if (r.ok && r.data) setReviews(r.data);
        else if (!r.ok) setError(r.error);
      });
    if (next === "metrics" && !metrics)
      start(async () => {
        const r = await loadPerformance(loc.id);
        if (r.ok && r.data) setMetrics(r.data);
        else if (!r.ok) setError(r.error);
      });
  };

  const link = (value: string) => {
    const [clientId, unitId] = value ? value.split("|") : [null, null];
    start(async () => {
      const r = await linkLocation(loc.id, clientId || null, unitId || null);
      if (r.ok) {
        toast.success(r.message ?? "");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <li className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{loc.title}</p>
          <p className="text-[13px] text-muted">{loc.address ?? loc.website ?? "Sem endereço"}</p>
          {loc.maps_uri ? (
            <a href={loc.maps_uri} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
              Ver no Google Maps
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="w-full sm:w-72">
          <label className="sr-only" htmlFor={`cli-${loc.id}`}>
            Cliente deste perfil
          </label>
          <Select id={`cli-${loc.id}`} value={loc.client_id ? `${loc.client_id}|${loc.unit_id ?? ""}` : ""} onChange={(e) => link(e.target.value)} disabled={pending}>
            <option value="">Sem cliente ligado</option>
            {clients.map((c) => (
              <optgroup key={c.id} label={c.name}>
                <option value={`${c.id}|`}>{c.name} (matriz)</option>
                {c.units.map((u) => (
                  <option key={u.id} value={`${c.id}|${u.id}`}>
                    {c.name} ({u.label})
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Button variant={tab === "reviews" ? "primary" : "secondary"} size="sm" onClick={() => open("reviews")}>
          <MessageSquare className="size-3.5" aria-hidden />
          Avaliações
        </Button>
        <Button variant={tab === "metrics" ? "primary" : "secondary"} size="sm" onClick={() => open("metrics")}>
          <BarChart3 className="size-3.5" aria-hidden />
          Desempenho
        </Button>
        <Button variant={tab === "post" ? "primary" : "secondary"} size="sm" onClick={() => open("post")} disabled={!client}>
          <Megaphone className="size-3.5" aria-hidden />
          Publicar artigo
        </Button>
      </div>

      {tab ? (
        <div className="border-t border-line p-4 sm:p-5">
          {error ? <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p> : null}
          {pending && !error ? <p className="text-sm text-muted">Carregando do Google…</p> : null}

          {tab === "reviews" && reviews ? (
            <div>
              <p className="text-sm text-muted">
                {reviews.total} avaliações{reviews.average ? `, nota ${reviews.average.toFixed(1).replace(".", ",")}` : ""}. Mostrando as mais recentes.
              </p>
              <ul className="mt-3 divide-y divide-line">
                {reviews.reviews.map((r) => (
                  <li key={r.name} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink">{r.author}</span>
                      <span className="inline-flex" aria-label={`${r.stars} estrelas`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={cn("size-3.5", i < r.stars ? "fill-current text-warn" : "text-line-strong")} aria-hidden />
                        ))}
                      </span>
                      {r.date ? <span className="text-[12.5px] text-faint">{formatDate(r.date)}</span> : null}
                    </div>
                    {r.comment ? <p className="mt-1 text-[14.5px] text-text">{r.comment}</p> : null}
                    {r.reply ? (
                      <p className="mt-2 border-l-2 border-line pl-3 text-[13.5px] text-muted">Resposta: {r.reply}</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          rows={3}
                          aria-label={`Resposta para ${r.author}`}
                          placeholder="Escreva a resposta ou peça uma sugestão"
                          value={drafts[r.name] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [r.name]: e.target.value }))}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                const s = await suggestReply(loc.id, r);
                                if (s.ok && s.data) setDrafts((d) => ({ ...d, [r.name]: s.data!.text }));
                                else if (!s.ok) toast.error(s.error);
                              })
                            }
                          >
                            <Sparkles className="size-3.5" aria-hidden />
                            Sugerir resposta
                          </Button>
                          <Button
                            size="sm"
                            disabled={pending || !(drafts[r.name] ?? "").trim()}
                            onClick={() =>
                              start(async () => {
                                const s = await sendReply(r.name, drafts[r.name] ?? "");
                                if (s.ok) {
                                  toast.success(s.message ?? "");
                                  setReviews((cur) => (cur ? { ...cur, reviews: cur.reviews.map((x) => (x.name === r.name ? { ...x, reply: drafts[r.name] } : x)) } : cur));
                                } else toast.error(s.error);
                              })
                            }
                          >
                            Publicar resposta
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tab === "metrics" && metrics ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Visualizações", metrics.views],
                ["Ligações", metrics.calls],
                ["Cliques no site", metrics.website],
                ["Pedidos de rota", metrics.directions],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-[var(--radius-control)] bg-sunken p-3">
                  <dd className="text-[24px] font-bold text-ink tabular-nums">{Number(value).toLocaleString("pt-BR")}</dd>
                  <dt className="text-[12.5px] text-muted">{label} em {metrics.days} dias</dt>
                </div>
              ))}
            </dl>
          ) : null}

          {tab === "post" ? (
            clientPosts.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`post-${loc.id}`} className="block text-sm font-medium text-ink">
                    Artigo no ar de {client?.name}
                  </label>
                  <Select id={`post-${loc.id}`} className="mt-1.5" value={postId} onChange={(e) => setPostId(e.target.value)}>
                    <option value="">Escolha o artigo</option>
                    {clientPosts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  disabled={!postId || pending}
                  onClick={() =>
                    start(async () => {
                      const r = await publishToGbp(postId);
                      if (r.ok) toast.success(r.message ?? "");
                      else toast.error(r.error);
                    })
                  }
                >
                  Publicar no Google
                </Button>
                <p className="w-full text-[12.5px] text-muted">Vira uma Novidade no perfil, com o resumo, a capa e o botão Saiba mais levando ao artigo.</p>
              </div>
            ) : (
              <p className="text-sm text-muted">Este cliente ainda não tem artigo no ar.</p>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
