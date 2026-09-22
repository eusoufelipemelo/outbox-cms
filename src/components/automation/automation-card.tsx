"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Link2, Play, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
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

// mesmos modelos do gerador de imagens da Mídia
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

export function AutomationCard({ client, telegramReady }: { client: AutomationClient; telegramReady: boolean }) {
  const a = client.automation;
  const [open, setOpen] = useState(!a);
  const [pending, start] = useTransition();
  const router = useRouter();

  const [perMonth, setPerMonth] = useState(a?.per_month ?? 4);
  const [weekdays, setWeekdays] = useState<number[]>(a?.weekdays ?? [2]);
  const [hour, setHour] = useState(a?.hour ?? 9);
  const [words, setWords] = useState(a?.words ?? 900);
  const [contentType, setContentType] = useState<string>(a?.content_type ?? "");
  const [cover, setCover] = useState(a?.cover ?? true);
  const [coverModel, setCoverModel] = useState(a?.cover_model ?? "gemini-3.1-flash-image");
  const [approval, setApproval] = useState<string>(a?.approval ?? "telegram");
  const [siteIds, setSiteIds] = useState<string[]>(a?.site_ids ?? []);

  const activeSites = client.sites.filter((s) => s.status === "active");
  const connected = Boolean(a?.telegram_chat_id);

  const save = (active: boolean) =>
    start(async () => {
      const r = await saveAutomation({
        clientId: client.id,
        active,
        perMonth,
        weekdays,
        hour,
        words,
        contentType: (contentType || null) as ContentType | null,
        cover,
        coverModel,
        siteIds,
        approval: approval as "telegram" | "auto" | "manual",
      });
      if (r.ok) {
        toast.success(active ? "Automação salva e ligada" : "Automação salva");
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });

  const toggle = () =>
    start(async () => {
      const r = await toggleAutomation(client.id, !a?.active);
      if (r.ok) {
        toast.success(r.message ?? "");
        router.refresh();
      } else toast.error(r.error);
    });

  const run = () =>
    start(async () => {
      if (!a) return;
      const r = await runNow(a.id);
      if (r.ok) {
        toast.success(r.message ?? "");
        router.refresh();
      } else toast.error(r.error);
    });

  const unlink = () =>
    start(async () => {
      const r = await unlinkTelegram(client.id);
      if (r.ok) {
        toast.success(r.message ?? "");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <li className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold text-ink">{client.name}</h3>
            {a ? (
              a.active ? (
                <Badge tone="ok">Ligada</Badge>
              ) : (
                <Badge tone="warn">Pausada</Badge>
              )
            ) : (
              <Badge>Sem automação</Badge>
            )}
            {a?.approval === "telegram" ? (
              connected ? (
                <Badge tone="info">Telegram conectado</Badge>
              ) : (
                <Badge tone="warn">Falta conectar o Telegram</Badge>
              )
            ) : null}
          </div>
          <p className="mt-1 text-[13.5px] text-muted">
            {a ? (
              <>
                {rhythmLabel({ weekdays: a.weekdays, hour: a.hour, perMonth: a.per_month })}
                {a.next_run_at && a.active ? `, próximo em ${formatDateTime(a.next_run_at)}` : ""}
              </>
            ) : (
              <>
                {activeSites.length ? `${activeSites.length} site(s) ativo(s)` : "Sem site ativo"}
                {client.segment ? `, ${client.segment}` : ""}
              </>
            )}
          </p>
          {a?.last_error ? <p className="mt-1 text-[13px] text-danger">{a.last_error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a ? (
            <>
              <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
                <Play className="size-3.5" aria-hidden />
                Rodar agora
              </Button>
              <Button variant="secondary" size="sm" onClick={toggle} disabled={pending}>
                <Power className="size-3.5" aria-hidden />
                {a.active ? "Pausar" : "Ligar"}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {a ? "Ajustar" : "Configurar"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </Button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line p-4 sm:p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Artigos por mês" htmlFor={`pm-${client.id}`} hint="A automação espalha as datas ao longo do mês.">
              <Input id={`pm-${client.id}`} type="number" min={1} max={30} value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))} />
            </Field>
            <Field label="Horário" htmlFor={`h-${client.id}`} hint="Horário de Brasília.">
              <Select id={`h-${client.id}`} value={hour} onChange={(e) => setHour(Number(e.target.value))}>
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

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <Field label="Tamanho do artigo" htmlFor={`w-${client.id}`} hint="Palavras aproximadas.">
              <Input id={`w-${client.id}`} type="number" min={400} max={2500} step={50} value={words} onChange={(e) => setWords(Number(e.target.value))} />
            </Field>
            <Field label="Formato" htmlFor={`ct-${client.id}`} hint="Deixe em automático para a IA escolher pelo tema.">
              <Select id={`ct-${client.id}`} value={contentType} onChange={(e) => setContentType(e.target.value)}>
                <option value="">Automático</option>
                {CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
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
                    name={`ap-${client.id}`}
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
                <p className="mt-1 text-[13.5px] text-warn">Falta configurar o bot no servidor (TELEGRAM_BOT_TOKEN). Veja as instruções no topo da página.</p>
              ) : !a ? (
                <p className="mt-1 text-[13.5px] text-muted">Salve a automação para gerar o link de conexão do cliente.</p>
              ) : connected ? (
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ok">
                    <Check className="size-4" aria-hidden />
                    Conversa conectada
                  </span>
                  <Button variant="ghost" size="sm" onClick={unlink} disabled={pending}>
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
                      onClick={() => {
                        navigator.clipboard.writeText(client.connectUrl ?? "").then(
                          () => toast.success("Link copiado"),
                          () => toast.error("Não foi possível copiar."),
                        );
                      }}
                    >
                      <Link2 className="size-3.5" aria-hidden />
                      Copiar
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-1 text-[13.5px] text-warn">Falta informar o nome do bot no servidor (TELEGRAM_BOT_USERNAME) para gerar o link.</p>
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
              Abrir cliente
            </Link>
          </div>
        </div>
      ) : null}
    </li>
  );
}
