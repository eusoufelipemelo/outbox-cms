"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Link2, Play, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ClientPicker, type PickerClient } from "@/components/ui/client-picker";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { CONTENT_TYPES } from "@/lib/ai/labels";
import { WEEKDAYS } from "@/lib/automation/schedule";
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
  if (a?.active && a.approval === "telegram" && !c.telegramConnected) return "Falta conectar o Telegram";
  if (a?.active && !c.services.blogGbp) return "Sem o serviço Blog + Google";
  if (a?.active && !c.sites.some((s) => s.status === "active")) return "Sem site ativo";
  return null;
}

export function AutomationManager({ clients, telegramReady }: { clients: AutomationClient[]; telegramReady: boolean }) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(clients.find((c) => c.automation)?.id ?? clients[0]?.id ?? null);

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

  const filtered = useMemo(
    () =>
      clients.filter((c) => {
        if (filter === "ligadas") return Boolean(c.automation?.active);
        if (filter === "pausadas") return Boolean(c.automation && !c.automation.active);
        if (filter === "sem") return !c.automation;
        if (filter === "atencao") return Boolean(needsAttention(c));
        return true;
      }),
    [clients, filter],
  );

  const options: PickerClient[] = filtered.map((c) => {
    const attention = needsAttention(c);
    return {
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      state: c.state,
      meta: attention ?? (c.automation ? (c.automation.active ? "Ligada" : "Pausada") : "Sem automação"),
      tone: attention ? "danger" : c.automation?.active ? "ok" : c.automation ? "warn" : "neutral",
    };
  });
  const selected = clients.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
        <ClientPicker clients={options} value={selectedId} onChange={setSelectedId} />
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar clientes">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFilter(f.key);
                const first = clients.find((c) =>
                  f.key === "ligadas"
                    ? c.automation?.active
                    : f.key === "pausadas"
                      ? c.automation && !c.automation.active
                      : f.key === "sem"
                        ? !c.automation
                        : f.key === "atencao"
                          ? needsAttention(c)
                          : true,
                );
                if (first) setSelectedId(first.id);
              }}
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
      </div>

      {selected ? (
        <AutomationEditor key={selected.id} client={selected} telegramReady={telegramReady} />
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-[15px] text-muted">Nenhum cliente com esse filtro.</p>
        </div>
      )}
    </div>
  );
}

function AutomationEditor({ client, telegramReady }: { client: AutomationClient; telegramReady: boolean }) {
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
  const connected = client.telegramConnected;
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

        <div className="mt-5 rounded-[var(--radius-control)] border border-line p-4 text-[13.5px] text-muted">
          <span className="font-semibold text-ink">Depois de aprovado: </span>
          {client.services.blogGbp
            ? client.services.instagram
              ? "pacote completo. O artigo vai para o blog, vira novidade no Google Empresas e vira post no Instagram (formatos definidos em Serviços)."
              : "o artigo vai para o blog e vira novidade no Google Empresas."
            : "este cliente não tem o serviço Blog + Google Empresas. Ative em Serviços."}{" "}
          <Link href="/servicos" className="underline underline-offset-2 hover:text-ink">
            Ver Serviços
          </Link>
        </div>

        {approval === "telegram" ? (
          <div className="mt-5 rounded-[var(--radius-control)] border border-line bg-sunken p-4">
            <p className="text-sm font-semibold text-ink">Telegram do cliente</p>
            {!telegramReady ? (
              <p className="mt-1 text-[13.5px] text-warn">Falta configurar o bot no servidor (TELEGRAM_BOT_TOKEN).</p>
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
