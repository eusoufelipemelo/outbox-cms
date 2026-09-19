"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Lightbulb, PenLine, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { callAi } from "@/lib/ai/client";
import { CONTENT_TYPE_LABEL, IDEA_INTENT } from "@/lib/ai/labels";
import type { AiOutput } from "@/lib/ai/types";
import type { ClientOption } from "@/lib/data/clients";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";

type Idea = AiOutput["ideas"]["ideas"][number];
type Saved = { ideas: Idea[]; focus: string; at: string };

const COUNTS = [6, 12, 18] as const;

// ---------------------------------------------------------------- memória da sessão
// Guarda as últimas pautas de cada cliente, para que voltar do editor não obrigue a gerar de novo.
// sessionStorage pode falhar (aba privada, bloqueio): a memória do módulo cobre esse caso.

const STORE_EVENT = "outbox:pautas";
const memory = new Map<string, string>();
const storageKey = (clientId: string) => `outbox:pautas:${clientId}`;

function readSaved(clientId: string): string | null {
  if (!clientId) return null;
  const inMemory = memory.get(clientId);
  if (inMemory) return inMemory;
  try {
    return window.sessionStorage.getItem(storageKey(clientId));
  } catch {
    return null;
  }
}

function writeSaved(clientId: string, value: Saved) {
  const raw = JSON.stringify(value);
  memory.set(clientId, raw);
  try {
    window.sessionStorage.setItem(storageKey(clientId), raw);
  } catch {
    // sem sessionStorage: fica só na memória da aba
  }
  window.dispatchEvent(new Event(STORE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(STORE_EVENT, onChange);
  return () => window.removeEventListener(STORE_EVENT, onChange);
}

function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Saved;
    return Array.isArray(value?.ideas) ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- tela

export function IdeasBoard({
  clients,
  initialClientId,
  aiEnabled,
}: {
  clients: ClientOption[];
  initialClientId: string;
  aiEnabled: boolean;
}) {
  const [clientId, setClientId] = useState(initialClientId);
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState<number>(12);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const raw = useSyncExternalStore(
    subscribe,
    () => readSaved(clientId),
    () => null,
  );
  const saved = useMemo(() => parseSaved(raw), [raw]);
  const client = clients.find((c) => c.id === clientId) ?? null;

  // Cancela o pedido em andamento ao sair da tela.
  useEffect(() => () => abortRef.current?.abort(), []);

  function selectClient(id: string) {
    abortRef.current?.abort();
    setPending(false);
    setError(null);
    setClientId(id);
    window.history.replaceState(null, "", id ? `?cliente=${encodeURIComponent(id)}` : window.location.pathname);
  }

  async function generate(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!clientId) {
      setError("Escolha um cliente para gerar pautas.");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const forClient = clientId;
    setPending(true);
    setError(null);
    try {
      const result = await callAi("ideas", { clientId: forClient, count, focus: focus.trim() || undefined }, { signal: controller.signal });
      writeSaved(forClient, { ideas: result.ideas, focus: focus.trim(), at: new Date().toISOString() });
      toast.success(result.ideas.length === 1 ? "1 pauta gerada" : `${result.ideas.length} pautas geradas`);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Não foi possível gerar as pautas. Tente de novo.";
      setError(message);
      toast.error(message);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(false);
      }
    }
  }

  const ideas = saved?.ideas ?? [];

  return (
    <div className="space-y-6">
      <Panel
        title="Gerar pautas"
        description="A IA parte do segmento, dos serviços, da cidade e das palavras-chave do cliente, considera a época do ano e evita repetir o que já está no ar."
      >
        {!aiEnabled ? (
          <p role="status" className="mb-5 rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-sm text-warn">
            Configure ANTHROPIC_API_KEY no Easypanel para gerar pautas.
          </p>
        ) : null}

        <form onSubmit={generate} noValidate className="grid gap-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_8rem] sm:items-start">
          <Field label="Cliente" htmlFor="pautas-cliente">
            <Select id="pautas-cliente" value={clientId} onChange={(e) => selectClient(e.target.value)}>
              <option value="">Selecione</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === "paused" ? " (pausado)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Foco"
            htmlFor="pautas-foco"
            hint="Opcional. Um serviço, público ou assunto para priorizar, como implantes ou reformas de verão."
          >
            <Input
              id="pautas-foco"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={300}
              autoComplete="off"
              placeholder="Deixe vazio para uma pauta variada"
            />
          </Field>
          <Field label="Quantidade" htmlFor="pautas-quantidade">
            <Select id="pautas-quantidade" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n} pautas
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-col gap-3 sm:col-span-3 sm:flex-row sm:items-center sm:justify-between">
            <ProfileHint client={client} />
            <Button type="submit" loading={pending} disabled={!aiEnabled || !clientId} className="justify-center sm:ml-auto">
              {pending ? null : <Sparkles className="size-4" aria-hidden />}
              {ideas.length ? "Gerar novas pautas" : "Gerar pautas"}
            </Button>
          </div>
        </form>
      </Panel>

      <div aria-live="polite" className="space-y-4">
        {pending ? (
          <p className="text-sm text-muted">Gerando pautas para {client?.name ?? "o cliente"}. Leva até um minuto.</p>
        ) : null}
        {error && !pending ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        {ideas.length > 0 && client ? (
          <IdeaList ideas={ideas} clientId={client.id} clientName={client.name} saved={saved} />
        ) : !pending ? (
          <EmptyIdeas hasClient={Boolean(client)} />
        ) : null}
      </div>
    </div>
  );
}

function ProfileHint({ client }: { client: ClientOption | null }) {
  if (!client || client.profileGaps.length === 0) return <span className="hidden sm:block" />;
  const gaps = client.profileGaps;
  const list = gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(", ")} e ${gaps[gaps.length - 1]}`;
  return (
    <p className="text-[13px] text-muted">
      Pautas ficam mais certeiras com o cadastro completo. Falta preencher {list} em{" "}
      <Link href={`/clientes/${client.id}`} className="font-medium text-ink underline underline-offset-3">
        {client.name}
      </Link>
      .
    </p>
  );
}

function EmptyIdeas({ hasClient }: { hasClient: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface px-6 py-10">
      <div className="text-brand">
        <Lightbulb className="size-7" aria-hidden />
      </div>
      <div>
        <p className="text-[17px] font-semibold text-ink">{hasClient ? "Nenhuma pauta ainda" : "Escolha um cliente"}</p>
        <p className="mt-1 max-w-[52ch] text-sm text-muted">
          {hasClient
            ? "Gere uma lista de ideias e escolha qual virar artigo. Cada pauta vem com palavra-chave, intenção de busca e ângulo."
            : "As pautas são feitas sob medida para o nicho, os serviços e a cidade de cada cliente."}
        </p>
      </div>
    </div>
  );
}

const savedAtFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function IdeaList({
  ideas,
  clientId,
  clientName,
  saved,
}: {
  ideas: Idea[];
  clientId: string;
  clientName: string;
  saved: Saved | null;
}) {
  const at = saved?.at ? new Date(saved.at) : null;
  return (
    <section aria-labelledby="pautas-lista">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pautas-lista" className="text-[15px] font-semibold text-ink">
          {ideas.length === 1 ? "1 pauta" : `${ideas.length} pautas`} para {clientName}
        </h2>
        <p className="text-[13px] text-muted">
          {saved?.focus ? `Foco: ${saved.focus}. ` : ""}
          {at && !Number.isNaN(at.getTime()) ? `Geradas às ${savedAtFmt.format(at)}.` : ""}
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {ideas.map((idea) => (
          <IdeaCard key={idea.title} idea={idea} clientId={clientId} />
        ))}
      </ul>
    </section>
  );
}

function IdeaCard({ idea, clientId }: { idea: Idea; clientId: string }) {
  const intent = IDEA_INTENT[idea.intent] ?? IDEA_INTENT.informacional;
  const params = new URLSearchParams({ cliente: clientId, tema: idea.title, palavra: idea.keyword, tipo: idea.content_type });
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={intent.tone}>{intent.label}</Badge>
        <Badge>{CONTENT_TYPE_LABEL[idea.content_type] ?? "Artigo"}</Badge>
      </div>
      <h3 className="text-[16px] leading-snug font-semibold text-ink">{idea.title}</h3>
      {idea.angle ? <p className="text-sm text-text">{idea.angle}</p> : null}
      <p className="text-[13px] text-muted">
        Palavra-chave: <span className="text-text">{idea.keyword}</span>
      </p>
      <div className="mt-auto pt-1">
        <Link href={`/artigos/novo?${params.toString()}`} className={buttonClass("secondary", "md")}>
          <PenLine className="size-4" aria-hidden />
          Escrever este artigo
        </Link>
      </div>
    </li>
  );
}
