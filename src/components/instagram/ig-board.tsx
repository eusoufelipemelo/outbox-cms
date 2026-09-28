"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Link2, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { createIgDraft, deleteIgPost, disconnectIg, publishIg, updateIgCaption } from "@/lib/data/ig-actions";

export type IgClient = { id: string; name: string; username: string | null; connected: boolean; link: string };
export type IgArticle = { id: string; title: string; clientId: string };
export type IgItem = {
  id: string;
  clientName: string;
  kind: "carousel" | "image" | "story";
  slides: { url: string }[];
  caption: string | null;
  status: "draft" | "awaiting" | "changes" | "publishing" | "published" | "failed";
  feedback: string | null;
  permalink: string | null;
  error: string | null;
  created_at: string;
};

type Result = { ok: boolean; message?: string; error?: string };

export function IgBoard({ clients, articles, items }: { clients: IgClient[]; articles: IgArticle[]; items: IgItem[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [articleId, setArticleId] = useState("");
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const act = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  const connectedIds = new Set(clients.filter((c) => c.connected).map((c) => c.id));
  const usable = articles.filter((a) => connectedIds.has(a.clientId));
  const drafts = items.filter((i) => i.status !== "published");
  const published = items.filter((i) => i.status === "published");

  return (
    <div className="space-y-8">
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
        <h2 className="text-[16px] font-semibold text-ink">Criar post a partir de um artigo</h2>
        <p className="mt-0.5 text-[13.5px] text-muted">O CMS monta o carrossel com as cores do cliente, a legenda com hashtags e um story chamando para o post.</p>
        {usable.length ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Select value={articleId} onChange={(e) => setArticleId(e.target.value)} aria-label="Artigo" className="min-w-0 flex-1">
              <option value="">Escolha um artigo no ar</option>
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {clients.find((c) => c.id === a.clientId)?.name}: {a.title}
                </option>
              ))}
            </Select>
            <Button disabled={!articleId || pending} loading={pending} onClick={() => act(() => createIgDraft(articleId))}>
              <Sparkles className="size-4" aria-hidden />
              Gerar carrossel e story
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Conecte o Instagram de um cliente que já tenha artigo no ar para começar.</p>
        )}
      </section>

      {drafts.length ? (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-ink">Para revisar e publicar</h2>
          <ul className="space-y-4">
            {drafts.map((it) => (
              <li key={it.id} className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{it.clientName}</span>
                  <Badge tone="neutral">{it.kind === "story" ? "Story" : "Carrossel"}</Badge>
                  {it.status === "failed" ? (
                    <Badge tone="danger">Falhou</Badge>
                  ) : it.status === "publishing" ? (
                    <Badge tone="info">Publicando</Badge>
                  ) : it.status === "awaiting" ? (
                    <Badge tone="warn">Com o cliente</Badge>
                  ) : it.status === "changes" ? (
                    <Badge tone="danger">Ajustes pedidos</Badge>
                  ) : null}
                  <span className="text-[12.5px] text-faint">{formatDateTime(it.created_at)}</span>
                </div>
                {it.error ? <p className="mt-2 text-[13px] text-danger">{it.error}</p> : null}
                {it.feedback ? <p className="mt-2 text-[13.5px] text-danger">Cliente pediu: {it.feedback}</p> : null}
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {it.slides.map((s, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={s.url}
                      src={s.url}
                      alt={`Lâmina ${i + 1}`}
                      className={it.kind === "story" ? "h-64 w-36 shrink-0 rounded-[10px] object-cover" : "h-48 w-[154px] shrink-0 rounded-[10px] object-cover"}
                    />
                  ))}
                </div>
                {it.kind !== "story" ? (
                  <div className="mt-3">
                    <label className="text-sm font-medium text-ink" htmlFor={`cap-${it.id}`}>
                      Legenda
                    </label>
                    <Textarea
                      id={`cap-${it.id}`}
                      rows={6}
                      className="mt-1.5"
                      value={captions[it.id] ?? it.caption ?? ""}
                      onChange={(e) => setCaptions((c) => ({ ...c, [it.id]: e.target.value }))}
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {captions[it.id] !== undefined && captions[it.id] !== it.caption ? (
                    <Button variant="secondary" size="sm" disabled={pending} onClick={() => act(() => updateIgCaption(it.id, captions[it.id]))}>
                      <Check className="size-3.5" aria-hidden />
                      Salvar legenda
                    </Button>
                  ) : null}
                  <Button size="sm" disabled={pending || it.status === "publishing"} onClick={() => act(() => publishIg(it.id))}>
                    <Send className="size-3.5" aria-hidden />
                    {it.status === "failed" ? "Tentar de novo" : "Publicar agora"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (confirm("Excluir este rascunho?")) act(() => deleteIgPost(it.id));
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Excluir
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[17px] font-semibold text-ink">Contas dos clientes</h2>
        <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{c.name}</span>
                <span className="block text-[13px] text-muted">{c.connected ? `Conectado${c.username ? ` como @${c.username}` : ""}` : "Instagram não conectado"}</span>
              </span>
              {c.connected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Desconectar o Instagram de ${c.name}?`)) act(() => disconnectIg(c.id));
                  }}
                >
                  Desconectar
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard.writeText(c.link).then(
                      () => toast.success("Link copiado. Envie para o cliente."),
                      () => toast.error("Não foi possível copiar."),
                    )
                  }
                >
                  <Link2 className="size-3.5" aria-hidden />
                  Copiar link de conexão
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {published.length ? (
        <section>
          <h2 className="mb-3 text-[17px] font-semibold text-ink">Publicados</h2>
          <ul className="divide-y divide-line rounded-[var(--radius-panel)] border border-line bg-surface">
            {published.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Badge tone="ok">{it.kind === "story" ? "Story" : "Carrossel"}</Badge>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{it.clientName}</span>
                <span className="text-[12.5px] text-faint">{formatDateTime(it.created_at)}</span>
                {it.permalink ? (
                  <a href={it.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
                    Ver no Instagram
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
