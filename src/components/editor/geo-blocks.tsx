"use client";

// Blocos de GEO no próprio canvas do artigo: aparecem como vão aparecer no site (resposta direta no
// topo; pontos principais, perguntas frequentes e fontes no fim), editáveis ali mesmo.

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANSWER_MAX_WORDS, ANSWER_MIN_WORDS, FAQ_MAX, TAKEAWAYS_MAX, countPlainWords, isHttpUrl } from "@/lib/geo";
import type { FaqItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SourceDraft } from "./types";

export const SOURCES_MAX = 30;

/** Textarea que cresce com o texto (sem barra de rolagem). */
function AutoTextarea({ className, value, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} className={cn("block w-full resize-none overflow-hidden bg-transparent", className)} {...props} />;
}

/** Campo sem moldura, com sublinhado que escurece no foco (o foco continua visível). */
const inline =
  "border-b border-transparent px-0 placeholder:text-faint transition-colors hover:border-line focus:border-ink focus:outline-none aria-[invalid=true]:border-danger";

function IconButton({ label, onClick, disabled, children, ...rest }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; [data: `data-${string}`]: string | number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent [&_svg]:size-4"
      {...rest}
    >
      {children}
    </button>
  );
}

function BlockShell({ id, title, hint, children, className }: { id: string; title: string; hint: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("px-5 py-8 sm:px-10 lg:px-14", className)}>
      <div className="mx-auto max-w-[720px]">
        <h2 id={id} className="text-[1.45rem] leading-tight font-bold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <p className="mt-1 text-[13px] text-muted">{hint}</p>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

/** Foca um elemento depois que o React aplicar a mudança (após adicionar, remover ou mover itens). */
function useFocusAfterRender() {
  const root = useRef<HTMLDivElement>(null);
  const focus = (selector: string) => {
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(selector)?.focus());
  };
  return { root, focus };
}

// ============ Resposta direta ============

export function AnswerBlock({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  const words = countPlainWords(value);
  const inRange = words >= ANSWER_MIN_WORDS && words <= ANSWER_MAX_WORDS;
  return (
    <div className="px-5 pb-6 sm:px-10 lg:px-14">
      <div className="mx-auto max-w-[720px] rounded-[var(--radius-control)] border border-line bg-sunken px-4 pt-3 pb-3.5 transition-colors focus-within:border-ink sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <label htmlFor="geo-answer" className="text-[13px] font-semibold text-ink">
            Resposta direta
          </label>
          <span
            id="geo-answer-count"
            className={cn("text-[12.5px] tabular-nums", words === 0 ? "text-muted" : inRange ? "text-ok" : "text-warn")}
          >
            {words} {words === 1 ? "palavra" : "palavras"} (ideal entre {ANSWER_MIN_WORDS} e {ANSWER_MAX_WORDS})
          </span>
        </div>
        <AutoTextarea
          id="geo-answer"
          value={value}
          maxLength={1000}
          onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder="Responda a pergunta do título em duas ou três frases."
          aria-describedby="geo-answer-hint geo-answer-count"
          className="mt-1.5 font-serif text-[1.125rem] leading-relaxed text-text placeholder:text-faint focus:outline-none"
        />
        <p id="geo-answer-hint" className="mt-1.5 text-[12.5px] text-muted">
          É o trecho que Google e IAs costumam citar. Responda a pergunta do título logo de cara.
        </p>
      </div>
    </div>
  );
}

// ============ Pontos principais ============

export function TakeawaysBlock({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const headingId = useId();
  const { root, focus } = useFocusAfterRender();
  const list = items.length ? items : [""];

  const set = (i: number, v: string) => onChange(list.map((x, j) => (j === i ? v : x)));
  const add = (at: number) => {
    if (list.length >= TAKEAWAYS_MAX) return;
    onChange([...list.slice(0, at), "", ...list.slice(at)]);
    focus(`[data-takeaway="${at}"]`);
  };
  const remove = (i: number) => {
    const next = list.filter((_, j) => j !== i);
    onChange(next);
    focus(next.length ? `[data-takeaway="${Math.max(0, i - 1)}"]` : "[data-takeaway-add]");
  };

  const onKey = (i: number) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (list[i].trim()) add(i + 1);
    } else if (e.key === "Backspace" && !list[i] && list.length > 1) {
      e.preventDefault();
      remove(i);
    }
  };

  return (
    <BlockShell id={headingId} title="Pontos principais" hint={`De 3 a 5 frases curtas que resumem o artigo (até ${TAKEAWAYS_MAX}). Enter cria o próximo.`}>
      <div ref={root}>
        <ul className="space-y-1">
          {list.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-[0.95rem] size-1.5 shrink-0 rounded-full bg-ink" />
              <label htmlFor={`${headingId}-${i}`} className="sr-only">
                Ponto principal {i + 1}
              </label>
              <AutoTextarea
                id={`${headingId}-${i}`}
                data-takeaway={i}
                value={item}
                maxLength={300}
                onChange={(e) => set(i, e.target.value.replace(/\s*\n\s*/g, " "))}
                onKeyDown={onKey(i)}
                placeholder={i === 0 ? "Uma frase com um fato concreto: prazo, preço, resultado" : "Outro ponto principal"}
                className={cn(inline, "min-h-10 py-2 font-serif text-[1.0625rem] leading-relaxed text-text")}
              />
              {list.length > 1 || item ? (
                <IconButton label={`Remover ponto principal ${i + 1}`} onClick={() => remove(i)}>
                  <X aria-hidden />
                </IconButton>
              ) : (
                <span className="size-10 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
        <Button variant="ghost" className="mt-2 -ml-3" onClick={() => add(list.length)} disabled={list.length >= TAKEAWAYS_MAX} data-takeaway-add>
          <Plus className="size-4" aria-hidden />
          Adicionar ponto
        </Button>
      </div>
    </BlockShell>
  );
}

// ============ Perguntas frequentes ============

/** Editor de FAQ reaproveitado no canvas e nas variações por site. */
export function FaqEditor({
  items,
  onChange,
  idPrefix,
  compact,
}: {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
  idPrefix: string;
  compact?: boolean;
}) {
  const { root, focus } = useFocusAfterRender();
  const [announce, setAnnounce] = useState("");

  const patch = (i: number, p: Partial<FaqItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    if (items.length >= FAQ_MAX) return;
    onChange([...items, { question: "", answer: "" }]);
    focus(`[data-faq-q="${items.length}"]`);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    setAnnounce(`Pergunta ${i + 1} removida.`);
    focus(items.length > 1 ? `[data-faq-q="${Math.min(i, items.length - 2)}"]` : "[data-faq-add]");
  };
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next);
    setAnnounce(`Pergunta movida para a posição ${to + 1} de ${items.length}.`);
    // mantém o foco no mesmo botão; se ele ficou desativado (chegou ao topo ou ao fim), vai para o outro
    const edge = to === 0 ? "down" : to === items.length - 1 ? "up" : dir === -1 ? "up" : "down";
    focus(`[data-faq-move="${edge}-${to}"]`);
  };

  return (
    <div ref={root}>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
      {items.length ? (
        <ol className={cn("divide-y divide-line border-y border-line", compact && "rounded-[var(--radius-control)] border")}>
          {items.map((item, i) => {
            const incomplete = Boolean(item.question.trim()) !== Boolean(item.answer.trim());
            const qId = `${idPrefix}-q-${i}`;
            const aId = `${idPrefix}-a-${i}`;
            return (
              <li key={i} className={cn("py-3", compact && "px-3")}>
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={qId} className="sr-only">
                      Pergunta {i + 1}
                    </label>
                    <AutoTextarea
                      id={qId}
                      data-faq-q={i}
                      value={item.question}
                      maxLength={300}
                      onChange={(e) => patch(i, { question: e.target.value.replace(/\s*\n\s*/g, " ") })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          root.current?.querySelector<HTMLElement>(`[data-faq-a="${i}"]`)?.focus();
                        }
                      }}
                      placeholder="Pergunta que o cliente faria"
                      className={cn(inline, "min-h-10 py-2 font-semibold text-ink", compact ? "text-[15px]" : "text-[1.0625rem]")}
                    />
                    <label htmlFor={aId} className="sr-only">
                      Resposta da pergunta {i + 1}
                    </label>
                    <AutoTextarea
                      id={aId}
                      data-faq-a={i}
                      value={item.answer}
                      maxLength={1500}
                      onChange={(e) => patch(i, { answer: e.target.value })}
                      placeholder="Resposta direta, em duas ou três frases"
                      aria-describedby={incomplete ? `${idPrefix}-warn-${i}` : undefined}
                      className={cn(inline, "min-h-10 py-1.5 font-serif leading-relaxed text-text", compact ? "text-[15px]" : "text-[1.0625rem]")}
                    />
                    {incomplete ? (
                      <p id={`${idPrefix}-warn-${i}`} className="mt-1 text-[12.5px] text-warn">
                        Preencha a pergunta e a resposta para este item ser salvo.
                      </p>
                    ) : null}
                  </div>
                  <div className={cn("flex shrink-0", compact ? "flex-col" : "flex-col sm:flex-row")}>
                    <IconButton label={`Mover pergunta ${i + 1} para cima`} onClick={() => move(i, -1)} disabled={i === 0} data-faq-move={`up-${i}`}>
                      <ArrowUp aria-hidden />
                    </IconButton>
                    <IconButton
                      label={`Mover pergunta ${i + 1} para baixo`}
                      onClick={() => move(i, 1)}
                      disabled={i === items.length - 1}
                      data-faq-move={`down-${i}`}
                    >
                      <ArrowDown aria-hidden />
                    </IconButton>
                    <IconButton label={`Remover pergunta ${i + 1}`} onClick={() => remove(i)}>
                      <X aria-hidden />
                    </IconButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <Button variant={compact ? "secondary" : "ghost"} className={cn("mt-2", !compact && "-ml-3")} onClick={add} disabled={items.length >= FAQ_MAX} data-faq-add>
        <Plus className="size-4" aria-hidden />
        Adicionar pergunta
      </Button>
      {items.length >= FAQ_MAX ? <p className="mt-1 text-[12.5px] text-muted">Limite de {FAQ_MAX} perguntas.</p> : null}
    </div>
  );
}

export function FaqBlock({ items, onChange }: { items: FaqItem[]; onChange: (items: FaqItem[]) => void }) {
  const headingId = useId();
  return (
    <BlockShell
      id={headingId}
      title="Perguntas frequentes"
      hint="Perguntas reais de clientes, com respostas curtas. Viram dados estruturados de FAQ para Google e IAs."
    >
      <FaqEditor items={items} onChange={onChange} idPrefix="faq" />
    </BlockShell>
  );
}

// ============ Fontes ============

/** Completa "gov.br/x" com https:// para o link valer. */
export function normalizeSourceUrl(value: string): string {
  const v = value.trim();
  if (!v || /^https?:\/\//i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+/.test(v)) return `https://${v}`;
  return v;
}

export function SourcesBlock({
  items,
  onChange,
  suggestions,
  onDismissSuggestions,
}: {
  items: SourceDraft[];
  onChange: (items: SourceDraft[]) => void;
  suggestions: string[];
  onDismissSuggestions: () => void;
}) {
  const headingId = useId();
  const { root, focus } = useFocusAfterRender();
  const [done, setDone] = useState<Set<number>>(() => new Set());

  const patch = (i: number, p: Partial<SourceDraft>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => {
    if (items.length >= SOURCES_MAX) return;
    onChange([...items, { title: "", url: "", publisher: "" }]);
    focus(`[data-source-title="${items.length}"]`);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    focus(items.length > 1 ? `[data-source-title="${Math.min(i, items.length - 2)}"]` : "[data-source-add]");
  };

  return (
    <BlockShell
      id={headingId}
      title="Fontes"
      hint="Cite pesquisas, órgãos oficiais e normas com o link real. Fontes verificáveis aumentam a confiança de buscadores e IAs."
    >
      <div ref={root}>
        {suggestions.length ? (
          <div className="mb-4 rounded-[var(--radius-control)] border border-line bg-sunken px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="pt-2 text-[13px] font-semibold text-ink">Adicione a fonte real para:</p>
              <Button variant="ghost" size="sm" className="h-10 shrink-0" onClick={onDismissSuggestions}>
                Dispensar lista
              </Button>
            </div>
            <ul className="mt-1 space-y-0.5">
              {suggestions.map((s, i) => {
                const checked = done.has(i);
                return (
                  <li key={s}>
                    <label className="flex min-h-10 cursor-pointer items-start gap-2.5 py-1.5 text-[13.5px] leading-snug">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDone((cur) => {
                            const next = new Set(cur);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                          checked ? "border-ink bg-ink text-white" : "border-line-strong bg-surface",
                        )}
                      >
                        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className={cn(checked ? "text-muted line-through" : "text-text")}>{s}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-1 text-[12.5px] text-muted">A IA não inventa links: confira cada fonte e cole o endereço verdadeiro.</p>
          </div>
        ) : null}

        {items.length ? (
          <ol className="divide-y divide-line border-y border-line">
            {items.map((item, i) => {
              const url = item.url.trim();
              const badUrl = url.length > 0 && !isHttpUrl(url);
              const missingUrl = !url && Boolean(item.title.trim() || item.publisher.trim());
              const p = `source-${i}`;
              return (
                <li key={i} className="flex items-start gap-2 py-3">
                  <span aria-hidden className="w-5 shrink-0 pt-2 text-right text-[13px] text-muted tabular-nums">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`${p}-title`} className="sr-only">
                      Título da fonte {i + 1}
                    </label>
                    <input
                      id={`${p}-title`}
                      data-source-title={i}
                      value={item.title}
                      maxLength={300}
                      onChange={(e) => patch(i, { title: e.target.value })}
                      placeholder="Título do estudo, página ou norma"
                      className={cn(inline, "h-10 w-full bg-transparent font-serif text-[1.0625rem] text-text")}
                    />
                    <div className="grid gap-x-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
                      <div className="min-w-0">
                        <label htmlFor={`${p}-url`} className="sr-only">
                          Link da fonte {i + 1}
                        </label>
                        <input
                          id={`${p}-url`}
                          type="url"
                          inputMode="url"
                          spellCheck={false}
                          value={item.url}
                          maxLength={2000}
                          onChange={(e) => patch(i, { url: e.target.value })}
                          onBlur={(e) => {
                            const n = normalizeSourceUrl(e.target.value);
                            if (n !== e.target.value) patch(i, { url: n });
                          }}
                          placeholder="https://"
                          aria-invalid={badUrl || undefined}
                          aria-describedby={badUrl || missingUrl ? `${p}-err` : undefined}
                          className={cn(inline, "h-10 w-full bg-transparent font-mono text-[13px] text-muted")}
                        />
                      </div>
                      <div className="min-w-0">
                        <label htmlFor={`${p}-pub`} className="sr-only">
                          Quem publicou a fonte {i + 1}
                        </label>
                        <input
                          id={`${p}-pub`}
                          value={item.publisher}
                          maxLength={160}
                          onChange={(e) => patch(i, { publisher: e.target.value })}
                          placeholder="Quem publicou (ex.: IBGE)"
                          className={cn(inline, "h-10 w-full bg-transparent text-[13.5px] text-text")}
                        />
                      </div>
                    </div>
                    {badUrl || missingUrl ? (
                      <p id={`${p}-err`} className="mt-1 text-[12.5px] text-warn">
                        {badUrl ? "Link inválido. Cole o endereço completo, com https://." : "Cole o link da fonte para ela ser salva."}
                      </p>
                    ) : null}
                  </div>
                  <IconButton label={`Remover fonte ${i + 1}`} onClick={() => remove(i)}>
                    <X aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ol>
        ) : null}
        <Button variant="ghost" className="mt-2 -ml-3" onClick={add} disabled={items.length >= SOURCES_MAX} data-source-add>
          <Plus className="size-4" aria-hidden />
          Adicionar fonte
        </Button>
      </div>
    </BlockShell>
  );
}
