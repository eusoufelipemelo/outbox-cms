"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { callAi } from "@/lib/ai/client";
import type { AiOutput } from "@/lib/ai/types";
import { CONTENT_TYPES } from "@/lib/geo";
import type { ContentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Dialog } from "./primitives";

export interface FullArticleRequest {
  topic: string;
  keyword: string;
  clientId: string;
  contentType: ContentType;
}

const SIZES = [
  { value: "short", label: "Curto", words: 700 },
  { value: "medium", label: "Médio", words: 1200 },
  { value: "long", label: "Longo", words: 1800 },
] as const;
type Size = (typeof SIZES)[number]["value"];

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * "Criar artigo completo com IA": tema, palavra-chave, cliente, tipo e tamanho viram um artigo pronto
 * para SEO e GEO. Monte só quando abrir (o estado nasce de `initial`).
 */
export function FullArticleDialog({
  initial,
  clients,
  enabled,
  onClose,
  onGenerated,
}: {
  initial: FullArticleRequest;
  clients: { id: string; name: string }[];
  enabled: boolean | null;
  onClose: () => void;
  /** Aplica o resultado. Pode pedir confirmação; devolve false se a pessoa desistiu. */
  onGenerated: (out: AiOutput["full_article"], req: FullArticleRequest) => Promise<boolean>;
}) {
  const [topic, setTopic] = useState(initial.topic);
  const [keyword, setKeyword] = useState(initial.keyword);
  const [clientId, setClientId] = useState(initial.clientId);
  const [contentType, setContentType] = useState<ContentType>(initial.contentType);
  const [size, setSize] = useState<Size>("medium");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // sair da tela no meio da geração cancela o pedido
  useEffect(() => () => controller.current?.abort(), []);

  const cancel = () => {
    controller.current?.abort();
  };

  const submit = async () => {
    const t = topic.trim();
    if (!t) {
      setError("Escreva o tema do artigo.");
      return;
    }
    const req: FullArticleRequest = { topic: t, keyword: keyword.trim(), clientId, contentType };
    const ac = new AbortController();
    controller.current = ac;
    setError(null);
    setElapsed(0);
    setRunning(true);
    try {
      const out = await callAi(
        "full_article",
        {
          topic: req.topic,
          keyword: req.keyword || undefined,
          clientId: req.clientId || undefined,
          contentType: req.contentType,
          words: SIZES.find((s) => s.value === size)?.words,
        },
        { signal: ac.signal },
      );
      setRunning(false);
      if (await onGenerated(out, req)) onClose();
    } catch (err) {
      setRunning(false);
      if (ac.signal.aborted) {
        toast.message("Geração cancelada");
        return;
      }
      setError(err instanceof Error ? err.message : "O assistente não respondeu. Tente de novo.");
    } finally {
      controller.current = null;
    }
  };

  const off = enabled !== true;

  return (
    <Dialog
      open
      onClose={() => {
        if (running) cancel();
        else onClose();
      }}
      dismissible={!running}
      title="Criar artigo completo com IA"
      description="Gera título, texto, resposta direta, pontos principais, perguntas frequentes e SEO. Você revisa antes de publicar."
      className="w-[min(calc(100%-2rem),560px)]"
      footer={
        running ? (
          <Button variant="secondary" onClick={cancel}>
            Cancelar geração
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button type="submit" form="full-article-form" disabled={off || !topic.trim()}>
              Criar artigo
            </Button>
          </>
        )
      }
    >
      {running ? (
        <div role="status" aria-live="polite" className="space-y-3 py-2">
          <p className="text-[15px] font-medium text-ink">Escrevendo o artigo completo…</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
            <div className="h-full w-1/3 animate-pulse rounded-full bg-ink" />
          </div>
          <p className="text-[13px] text-muted">
            <span className="tabular-nums">{clock(elapsed)}</span>. O CMS pesquisa fontes na web, escreve e corrige o texto até fechar 10 de 10 em SEO e GEO. Costuma levar de 2 a 5 minutos. Pode
            continuar aqui ou cancelar.
          </p>
        </div>
      ) : (
        <form
          id="full-article-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          {off ? (
            <p className="rounded-[var(--radius-control)] bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
              {enabled === null ? "Verificando o assistente…" : "O assistente está desligado neste ambiente. Configure ANTHROPIC_API_KEY para ativar."}
            </p>
          ) : null}
          <Field label="Tema" htmlFor="fa-topic" hint="Do que o artigo trata, de preferência como a pergunta que o leitor faz.">
            <Textarea
              id="fa-topic"
              rows={2}
              value={topic}
              maxLength={300}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex.: Quanto custa um implante dentário e quanto tempo dura o tratamento"
              autoFocus
              aria-invalid={Boolean(error && !topic.trim()) || undefined}
            />
          </Field>
          <Field label="Palavra-chave (opcional)" htmlFor="fa-keyword" hint="O termo que as pessoas buscam. Se ficar vazio, a IA escolhe.">
            <Input id="fa-keyword" value={keyword} maxLength={120} onChange={(e) => setKeyword(e.target.value)} placeholder="Ex.: implante dentário em Curitiba" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cliente (opcional)" htmlFor="fa-client" hint="Usa tom de voz, cidade, serviços e especialista.">
              <Select id="fa-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Nenhum cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tipo de conteúdo" htmlFor="fa-type">
              <Select id="fa-type" value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)}>
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Tamanho</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SIZES.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    "flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-control)] border px-2 py-2 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                    size === s.value ? "border-ink bg-sunken" : "border-line-strong hover:border-ink",
                  )}
                >
                  <input type="radio" name="fa-size" value={s.value} checked={size === s.value} onChange={() => setSize(s.value)} className="sr-only" />
                  <span className="text-sm font-medium text-ink">{s.label}</span>
                  <span className="text-[12.5px] text-muted tabular-nums">cerca de {s.words.toLocaleString("pt-BR")} palavras</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
