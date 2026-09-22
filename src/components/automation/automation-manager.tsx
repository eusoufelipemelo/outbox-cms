"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronRight, Link2, Play, Power, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { CONTENT_TYPES } from "@/lib/ai/labels";
import { WEEKDAYS, rhythmLabel } from "@/lib/automation/schedule";
import { runNow, saveAutomation, toggleAutomation, unlinkTelegram } from "@/lib/data/automation-actions";
import type { AutomationClient } from "@/lib/data/automations";
import type { ContentType } from "@/lib/types";

const TYPE_LABEL: Record<ContentType, string> = {
  article: "Artigo",
  howto: "Passo a passo",
  guide: "Guia",
  list: "Lista",
  comparison: "Comparativo",
  news: "Notícia",
};

const MODELS = [
  { value: "gemini-3.1-flash-image", label: "Flash (equilíbrio)" },
  { value: "gemini-3-pro-image", label: "Pro (melhor qualidade)" },
  { value: "gemini-3.1-flash-lite-image", label: "Flash Lite (mais barato)" },
];

const APPROVALS = [
  { value: "telegram", label: "Cliente aprova pelo Telegram", hint: "O rascunho vai para o cliente. Ele toca em aprovar e o artigo vai ao ar." },
  { value: "auto", label: "Publicar direto", hint: "Sem aprovação: o artigo vai ao ar no horário combinado." },
  { value: "manual", label: "Deixar em rascunho", hint: "A equipe revisa e publica pelo CMS." },
] as const;

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "ligadas", label: "Ligadas" },
  { key: "pausadas", label: "Pausadas" },
  { key: "sem", label: "Sem automação" },
  { key: "atencao", label: "Precisam de atenção" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const MAX_ROWS = 150;
const today = () => new Date().toISOString().slice(0, 10);

/** Cliente que pede ação: sem Telegram conectado, contrato vencido/vencendo ou erro na última rodada. */
function needsAttention(c: AutomationClient): string | null {
  const a = c.automation;
  if (a?.last_error) return "Erro na última execução";
  if (c.contractEnd) {
    if (c.contractEnd < today()) return "Contrato vencido";
    const days = Math.round((Date.parse(c.contractEnd) - Date.now()) / 86_400_000);
    if (days <= 30) return `Contrato vence em ${days} dia(s)`;
  }
  if (a?.active && a.approval === "telegram" && !a.telegram_chat_id) return "Falta conectar o Telegram";
  if (a?.active && !c.sites.some((s) => s.status === "active")) return "Sem site ativo";
  return null;
}

export function AutomationManager({ clients, telegramReady }: { clients: AutomationClient[]; telegramReady: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(clients.find((c) => c.automation)?.id ?? clients[0]?.id ?? null);
  const detail = useRef<HTMLDivElement>(null);

  const counts = useMemo(
    () => ({
      todos: clients.length,
      ligadas: clients.filter((c) => c.automation?.active).length,
      pausadas: clients.filter((c) => c.automation && !c.automation.active).length,
      sem: clients.filter((c) => !c.automation).length,
      atencao: clients.filter((c) => needsAttention(c)).length,
    }),
    [clients],
  );

  const filtered = useMemo(() => {
    const q = fold(query).trim();
    return clients.filter((c) => {
      if (q && !fold(`${c.name} ${c.segment ?? ""} ${c.city ?? ""}`).includes(q)) return false;
      if (filter === "ligadas") return Boolean(c.automation?.active);
      if (filter === "pausadas") return Boolean(c.automation && !c.automation.active);
      if (filter === "sem") return !c.automation;
      if (filter === "atencao") return Boolean(needsAttention(c));
      return true;
    });
  }, [clients, query, filter]);

  const selected = clients.find((c) => c.id === selectedId) ?? null;

  const choose = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 lg:sticky lg:top-6">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente"
            aria-label="Buscar cliente"
            className="pl-9"
            autoComplete="off"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-[var(--radius-chip)] border px-2.5 py-1 text-[12.5px] transition-colors",
                filter === f.key ? "border-ink bg-ink font-medium text-on-ink" : "border-line text-muted hover:border-ink hover:text-ink",
              )}
            >
              {f.label}
              <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <ul className="mt-3 max-h-[min(60vh,560px)] space-y-0.5 overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
          {filtered.slice(0, MAX_ROWS).map((c) => {
            const a = c.automation;
            const attention = needsAttention(c);
            const on = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => choose(c.id)}
                  aria-current={on ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors",
                    on ? "bg-sunken" : "hover:bg-sunken",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      a?.active ? "bg-ok" : a ? "bg-warn" : "bg-line-strong",
                      attention && a?.active ? "bg-danger" : "",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14px]", on ? "font-semibold text-ink" : "text-text")}>{c.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {a ? rhythmLabel({ weekdays: a.weekdays, hour: a.hour, perMonth: a.per_month }) : (c.segment ?? "Sem automação")}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? <li className="px-2.5 py-6 text-[13.5px] text-muted">Nenhum cliente com esse filtro.</li> : null}
          {filtered.length > MAX_ROWS ? (
            <li className="px-2.5 py-3 text-[12.5px] text-muted">
              Mostrando {MAX_ROWS} de {filtered.length}. Use a busca para achar um cliente.
            </li>
          ) : null}
        </ul>
      </div>

      <div ref={detail} className="scroll-mt-20">
        {selected ? (
          <AutomationEditor key={selected.id} client={selected} telegramReady={telegramReady} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-10 text-center">
            <p className="text-[15px] text-muted">Escolha um cliente na lista para configurar a automação dele.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AutomationEditor({ client, telegramReady, onBack }: { client: AutomationClient; telegramReady: boolean; onBack: () => void }) {
  const a = client.automation;
  const [pending, start] = useTransition();
  const router = useRouter();

  const [perMonth, setPerMonth] = useState(a?.per_month ?? 4);
  const [weekdays, setWeekdays] = useState<number[]>(a?.weekdays ?? [2]);
  const [hour, setHour] = useState(a?.hour ?? 9);
  const [words, setWords] = useState(a?.words ?? 900);
  const [contentType, setContentType] = useState<string>(a?.content_type ?? "");
  const [authorName, setAuthorName] = useState(a?.author_name ?? client.expertName ?? "");
  const [cover, setCover] = useState(a?.cover ?? true);
  const [coverModel, setCoverModel] = useState(a?.cover_model ?? "gemini-3.1-flash-image");
  const [approval, setApproval] = useState<string>(a?.approval ?? "telegram");
  const [siteIds, setSiteIds] = useState<string[]>(a?.site_ids ?? []);

  const activeSites = client.sites.filter((s) => s.status === "active");
  const connected = Boolean(a?.telegram_chat_id);
  const attention = needsAttention(client);

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  const save = (active: boolean) =>
    act(() =>
      saveAutomation({
        clientId: client.id,
        active,
        perMonth,
        weekdays,
        hour,
        words,
        contentType: (contentType || null) as ContentType | null,
        authorName: authorName.trim() || null,
        cover,
        coverModel,
        siteIds,
        approval: approval as "telegram" | "auto" | "manual",
      }),
    );

  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
        <div className="min-w-0">
          <button type="button" onClick={onBack} className="mb-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink lg:hidden">
            <ArrowLeft className="size-3.5" aria-hidden />
            Lista de clientes
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-bold text-ink">{client.name}</h2>
            {a ? a.active ? <Badge tone="ok">Ligada</Badge> : <Badge tone="warn">Pausada</Badge> : <Badge>Sem automação</Badge>}
            {attention ? <Badge tone="danger">{attention}</Badge> : null}
          </div>
          <p className="mt-1 text-[13.5px] text-muted">
            {[client.segment, client.city].filter(Boolean).join(", ") || "Sem segmento"}
            {a?.next_run_at && a.active ? `, próximo artigo em ${formatDateTime(a.next_run_at)}` : ""}
            {client.contractEnd ? `, contrato até ${formatDate(client.contractEnd)}` : ""}
          </p>
          {a?.last_error ? <p className="mt-1 text-[13px] text-danger">{a.last_error}</p> : null}
        </div>
        {a ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => act(() => runNow(a.id))} disabled={pending}>
              <Play className="size-3.5" aria-hidden />
              Rodar agora
            </Button>
            <Button variant="secondary" size="sm" onClick={() => act(() => toggleAutomation(client.id, !a.active))} disabled={pending}>
              <Power className="size-3.5" aria-hidden />
              {a.active ? "Pausar" : "Ligar"}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="p-4 sm:p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Artigos por mês" htmlFor="pm" hint="A automação espalha as datas ao longo do mês.">
            <Input id="pm" type="number" min={1} max={30} value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))} />
          </Field>
          <Field label="Horário" htmlFor="h" hint="Horário de Brasília.">
            <Select id="h" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {String(i).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Dias possíveis</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = weekdays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d.value) : [...w, d.value]))}
                  className={cn(
                    "h-9 rounded-[var(--radius-chip)] border px-3.5 text-[13.5px] transition-colors",
                    on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-muted hover:border-ink hover:text-ink",
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-5 md:grid-cols-3">
          <Field label="Tamanho do artigo" htmlFor="w" hint="Palavras aproximadas.">
            <Input id="w" type="number" min={400} max={2500} step={50} value={words} onChange={(e) => setWords(Number(e.target.value))} />
          </Field>
          <Field label="Formato" htmlFor="ct" hint="Automático deixa a IA escolher pelo tema.">
            <Select id="ct" value={contentType} onChange={(e) => setContentType(e.target.value)}>
              <option value="">Automático</option>
              {CONTENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Autor dos artigos"
            htmlFor="author"
            hint={client.expertName ? `Especialista do cadastro: ${client.expertName}` : "Quem assina os artigos deste cliente."}
          >
            <Input id="author" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Nome de quem assina" maxLength={120} />
          </Field>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="mt-1 accent-[var(--color-ink)]" />
              <span>
                <span className="block text-sm font-medium text-ink">Gerar imagem de capa</span>
                <span className="block text-[13px] text-muted">Uma imagem por artigo, criada a partir do tema.</span>
              </span>
            </label>
            {cover ? (
              <p className="mt-2 text-[12.5px] text-muted">
                {client.visual ? `Identidade visual do cliente: ${client.visual}.` : "Este cliente ainda não tem identidade visual definida: as capas seguem só o tema do artigo."}{" "}
                <Link href={`/clientes/${client.id}`} className="underline underline-offset-2 hover:text-ink">
                  Editar no cadastro
                </Link>
              </p>
            ) : null}
            {cover ? (
              <Select className="mt-3" value={coverModel} onChange={(e) => setCoverModel(e.target.value)} aria-label="Modelo da imagem">
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Sites de destino</legend>
            {activeSites.length ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[13px] text-muted">Sem marcar nenhum, vai para todos os sites ativos.</p>
                {activeSites.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 text-[14px] text-text">
                    <input
                      type="checkbox"
                      checked={siteIds.includes(s.id)}
                      onChange={(e) => setSiteIds((ids) => (e.target.checked ? [...ids, s.id] : ids.filter((i) => i !== s.id)))}
                      className="accent-[var(--color-ink)]"
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-warn">Este cliente não tem site ativo. Cadastre um site antes de ligar a automação.</p>
            )}
          </fieldset>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-ink">Quando o artigo ficar pronto</legend>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {APPROVALS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3",
                  approval === opt.value ? "border-ink bg-sunken" : "border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="approval"
                  value={opt.value}
                  checked={approval === opt.value}
                  onChange={() => setApproval(opt.value)}
                  className="mt-1 accent-[var(--color-ink)]"
                />
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{opt.label}</span>
                  <span className="block text-[12.5px] text-muted">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {approval === "telegram" ? (
          <div className="mt-5 rounded-[var(--radius-control)] border border-line bg-sunken p-4">
            <p className="text-sm font-semibold text-ink">Telegram do cliente</p>
            {!telegramReady ? (
              <p className="mt-1 text-[13.5px] text-warn">Falta configurar o bot no servidor (TELEGRAM_BOT_TOKEN).</p>
            ) : !a ? (
              <p className="mt-1 text-[13.5px] text-muted">Salve a automação para gerar o link de conexão do cliente.</p>
            ) : connected ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ok">
                  <Check className="size-4" aria-hidden />
                  Conversa conectada
                </span>
                <Button variant="ghost" size="sm" onClick={() => act(() => unlinkTelegram(client.id))} disabled={pending}>
                  Desconectar
                </Button>
              </div>
            ) : client.connectUrl ? (
              <div className="mt-2">
                <p className="text-[13.5px] text-muted">Envie este link para o cliente. Ele abre o Telegram e conecta a conversa.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 font-mono text-[12.5px] text-text">
                    {client.connectUrl}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(client.connectUrl ?? "").then(
                        () => toast.success("Link copiado"),
                        () => toast.error("Não foi possível copiar."),
                      )
                    }
                  >
                    <Link2 className="size-3.5" aria-hidden />
                    Copiar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[13.5px] text-warn">Não consegui descobrir o nome do bot. Confira TELEGRAM_BOT_TOKEN no servidor.</p>
            )}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button onClick={() => save(true)} loading={pending}>
            {a?.active ? "Salvar" : "Salvar e ligar"}
          </Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
            Salvar pausada
          </Button>
          <Link href={`/clientes/${client.id}`} className="ml-auto text-sm text-muted hover:text-ink">
            Abrir cadastro do cliente
          </Link>
        </div>
      </div>
    </div>
  );
}
