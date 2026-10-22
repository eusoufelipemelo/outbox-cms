"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ClientPicker, type PickerClient } from "@/components/ui/client-picker";
import { CHECKLIST, progress, type ChecklistState } from "@/lib/gbp-checklist";
import { setChecklistItem, setChecklistNote } from "@/lib/data/gbp-checklist-actions";
import type { ChecklistClient } from "@/lib/data/gbp-checklist";
import { cn, formatDate } from "@/lib/utils";

type FilterKey = "todos" | "nao" | "andamento" | "concluidos";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "andamento", label: "Em andamento" },
  { key: "nao", label: "Não iniciados" },
  { key: "concluidos", label: "Concluídos" },
];

function stage(items: ChecklistState): Exclude<FilterKey, "todos"> {
  const p = progress(items);
  if (p.done === 0) return "nao";
  return p.done === p.total ? "concluidos" : "andamento";
}

export function ChecklistBoard({ clients }: { clients: ChecklistClient[] }) {
  // estado local por cliente, para marcar sem esperar o servidor
  const [itemsBy, setItemsBy] = useState<Record<string, ChecklistState>>(() => Object.fromEntries(clients.map((c) => [c.id, c.items])));
  const [doneAt, setDoneAt] = useState<Record<string, string | null>>(() => Object.fromEntries(clients.map((c) => [c.id, c.completedAt])));
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(
    clients.find((c) => stage(c.items) === "andamento")?.id ?? clients[0]?.id ?? null,
  );

  const counts = useMemo(() => {
    const out = { todos: clients.length, nao: 0, andamento: 0, concluidos: 0 };
    for (const c of clients) out[stage(itemsBy[c.id] ?? {})]++;
    return out;
  }, [clients, itemsBy]);

  const filtered = clients.filter((c) => filter === "todos" || stage(itemsBy[c.id] ?? {}) === filter);
  const options: PickerClient[] = filtered.map((c) => {
    const p = progress(itemsBy[c.id] ?? {});
    return {
      id: c.id,
      name: c.name,
      segment: c.segment,
      city: c.city,
      state: c.state,
      meta: p.done ? `${p.pct}%` : "Não iniciado",
      tone: p.done === p.total ? "ok" : p.done ? "info" : "neutral",
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
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                const first = clients.find((c) => f.key === "todos" || stage(itemsBy[c.id] ?? {}) === f.key);
                if (first) setSelectedId(first.id);
              }}
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
        <ClientChecklist
          key={selected.id}
          client={selected}
          items={itemsBy[selected.id] ?? {}}
          completedAt={doneAt[selected.id] ?? null}
          onItems={(next) => setItemsBy((m) => ({ ...m, [selected.id]: next }))}
          onCompleted={(at) => setDoneAt((m) => ({ ...m, [selected.id]: at }))}
        />
      ) : (
        <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-6 text-sm text-muted">Nenhum cliente neste filtro.</p>
      )}
    </div>
  );
}

function ClientChecklist({
  client,
  items,
  completedAt,
  onItems,
  onCompleted,
}: {
  client: ChecklistClient;
  items: ChecklistState;
  completedAt: string | null;
  onItems: (next: ChecklistState) => void;
  onCompleted: (at: string | null) => void;
}) {
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const p = progress(items);

  const toggle = (key: string) => {
    const done = !items[key]?.done;
    const prev = items;
    onItems({ ...items, [key]: { ...items[key], done, at: done ? new Date().toISOString() : undefined } });
    start(async () => {
      const r = await setChecklistItem(client.id, key, done);
      if (!r.ok) {
        onItems(prev);
        toast.error(r.error);
      } else {
        onCompleted(r.data?.completedAt ?? null);
        if (r.data?.completedAt && !completedAt) toast.success("Otimização concluída. Hora do relatório de antes e depois.");
      }
    });
  };

  const saveNote = (key: string) => {
    const note = draft.trim();
    setEditing(null);
    if ((items[key]?.note ?? "") === note) return;
    const prev = items;
    onItems({ ...items, [key]: { ...items[key], note: note || undefined } });
    start(async () => {
      const r = await setChecklistNote(client.id, key, note);
      if (!r.ok) {
        onItems(prev);
        toast.error(r.error);
      } else toast.success("Anotação salva");
    });
  };

  const jump = (id: string) => document.getElementById(`etapa-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold text-ink">{client.name}</h2>
              {completedAt ? (
                <Badge tone="ok">Concluída em {formatDate(completedAt)}</Badge>
              ) : p.done ? (
                <Badge tone="info">Em andamento</Badge>
              ) : (
                <Badge>Não iniciada</Badge>
              )}
            </div>
            <p className="mt-0.5 text-[13.5px] text-muted">{[client.segment, client.city && client.state ? `${client.city}/${client.state}` : client.city].filter(Boolean).join(", ") || "Sem segmento"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {client.mapsUri ? (
              <a href={client.mapsUri} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 text-[13px] text-text hover:border-ink">
                Ver no Maps
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <a
              href="https://business.google.com/locations"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong px-3 text-[13px] text-text hover:border-ink"
            >
              Abrir o Google Empresas
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className="text-[15px] text-text">
            <span className="text-[28px] font-bold tabular-nums text-ink">{p.done}</span>
            <span className="text-muted"> de {p.total} itens</span>
          </p>
          <span className="text-[13px] tabular-nums text-muted">{p.pct}%</span>
        </div>
        {/* uma faixa por etapa, na ordem do trabalho; clicar leva até a etapa */}
        <div className="mt-2 grid grid-cols-10 gap-1" role="list" aria-label="Progresso por etapa">
          {CHECKLIST.map((s, i) => {
            const done = s.items.filter((it) => items[it.key]?.done).length;
            const ratio = done / s.items.length;
            return (
              <button
                key={s.id}
                type="button"
                role="listitem"
                onClick={() => jump(s.id)}
                title={`${i + 1}. ${s.title}: ${done} de ${s.items.length}`}
                aria-label={`Etapa ${i + 1}, ${s.title}: ${done} de ${s.items.length}`}
                className="group h-2.5 overflow-hidden rounded-full bg-sunken ring-1 ring-line ring-inset focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span
                  className={cn("block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", ratio === 1 ? "bg-ok" : "bg-ink")}
                  style={{ width: `${ratio * 100}%` }}
                />
              </button>
            );
          })}
        </div>
      </section>

      <ol className="space-y-3">
        {CHECKLIST.map((s, i) => {
          const done = s.items.filter((it) => items[it.key]?.done).length;
          const complete = done === s.items.length;
          return (
            <li key={s.id} id={`etapa-${s.id}`} className="scroll-mt-4 rounded-[var(--radius-panel)] border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums",
                    complete ? "bg-ok-soft text-ok" : "bg-sunken text-ink ring-1 ring-line ring-inset",
                  )}
                >
                  {complete ? <Check className="size-4" /> : i + 1}
                </span>
                <h3 className="flex-1 text-[15.5px] font-semibold text-ink">{s.title}</h3>
                <span className="text-[13px] tabular-nums text-muted">
                  {done}/{s.items.length}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {s.items.map((it) => {
                  const st = items[it.key] ?? {};
                  return (
                    <li key={it.key} className="flex gap-3 px-4 py-3 sm:px-5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={Boolean(st.done)}
                        aria-label={it.label}
                        onClick={() => toggle(it.key)}
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors",
                          st.done ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-surface hover:border-ink",
                        )}
                      >
                        {st.done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[14.5px] font-medium", st.done ? "text-muted" : "text-ink")}>{it.label}</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{it.how}</p>
                        {editing === it.key ? (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              rows={2}
                              autoFocus
                              aria-label={`Anotação: ${it.label}`}
                              placeholder={it.note ?? "Anote o que foi feito ou decidido"}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditing(null);
                              }}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveNote(it.key)}>
                                Salvar anotação
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : st.note ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft(st.note ?? "");
                              setEditing(it.key);
                            }}
                            className="mt-2 block w-full rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 text-left text-[13.5px] whitespace-pre-wrap text-text hover:border-line-strong"
                          >
                            {st.note}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDraft("");
                              setEditing(it.key);
                            }}
                            className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"
                          >
                            <NotebookPen className="size-3.5" aria-hidden />
                            Anotar
                          </button>
                        )}
                        {st.done && st.at ? <p className="mt-1 text-[12px] text-faint">Feito em {formatDate(st.at)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
