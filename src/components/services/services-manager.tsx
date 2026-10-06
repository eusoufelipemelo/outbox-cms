"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Link2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ClientPicker, type PickerClient } from "@/components/ui/client-picker";
import { cn, formatDateTime } from "@/lib/utils";
import { WEEKDAYS } from "@/lib/automation/schedule";
import { runIgNow, saveIgAutomation, setServices } from "@/lib/data/service-actions";
import type { IgFormat, ServiceClient } from "@/lib/data/services";

type Mode = "completo" | "blog" | "instagram" | "nenhum";

function modeOf(c: Pick<ServiceClient, "blogGbp" | "instagram">): Mode {
  if (c.blogGbp && c.instagram) return "completo";
  if (c.blogGbp) return "blog";
  if (c.instagram) return "instagram";
  return "nenhum";
}

const MODE: Record<Mode, { label: string; tone: "ok" | "info" | "warn" | "neutral"; text: string }> = {
  completo: {
    label: "Pacote completo",
    tone: "ok",
    text: "O artigo do blog é a base de tudo: ao ir ao ar, vira novidade no Google Empresas e post no Instagram. Os posts extras do plano saem do calendário do Instagram abaixo.",
  },
  blog: { label: "Blog + Google Empresas", tone: "info", text: "Cada artigo do blog vai ao ar e vira novidade no Google Empresas." },
  instagram: {
    label: "Só Instagram",
    tone: "warn",
    text: "Instagram independente: o CMS cria pautas, carrosséis e stories próprios no calendário abaixo, sem artigo por trás.",
  },
  nenhum: { label: "Sem serviço", tone: "neutral", text: "Nenhum serviço ativo: automações deste cliente ficam paradas." },
};

const FILTERS: { key: "todos" | Mode; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "completo", label: "Pacote completo" },
  { key: "blog", label: "Blog + Google" },
  { key: "instagram", label: "Só Instagram" },
  { key: "nenhum", label: "Sem serviço" },
];

export function ServicesManager({ clients }: { clients: ServiceClient[] }) {
  const [filter, setFilter] = useState<"todos" | Mode>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.id ?? null);

  const counts = useMemo(() => {
    const out: Record<string, number> = { todos: clients.length, completo: 0, blog: 0, instagram: 0, nenhum: 0 };
    for (const c of clients) out[modeOf(c)]++;
    return out;
  }, [clients]);

  const filtered = useMemo(() => clients.filter((c) => filter === "todos" || modeOf(c) === filter), [clients, filter]);
  const options: PickerClient[] = filtered.map((c) => {
    const m = modeOf(c);
    return { id: c.id, name: c.name, segment: c.segment, city: c.city, state: c.state, meta: MODE[m].label, tone: MODE[m].tone };
  });
  const selected = clients.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-3 sm:p-4">
        <ClientPicker clients={options} value={selectedId} onChange={setSelectedId} />
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por pacote">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => {
                setFilter(f.key);
                const first = clients.find((c) => f.key === "todos" || modeOf(c) === f.key);
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
        <ServiceEditor key={selected.id} client={selected} />
      ) : (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="text-[15px] text-muted">Nenhum cliente com esse filtro.</p>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-4", on ? "border-ink bg-sunken" : "border-line-strong")}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[var(--color-ink)]" />
      <span>
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Conn({ ok, label, detail, action }: { ok: boolean; label: string; detail: string; action?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", ok ? "bg-ok-soft text-ok" : "bg-sunken text-faint")}>
        {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink">{label}</span>
        <span className="block text-[12.5px] text-muted">{detail}</span>
      </span>
      {action}
    </li>
  );
}

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado. Envie para o cliente.`),
    () => toast.error("Não foi possível copiar."),
  );
}

function ServiceEditor({ client }: { client: ServiceClient }) {
  const [blogGbp, setBlogGbp] = useState(client.blogGbp);
  const [instagram, setInstagram] = useState(client.instagram);
  const [linkedin, setLinkedin] = useState(client.linkedin);
  const [formats, setFormats] = useState<IgFormat[]>(client.formats.length ? client.formats : ["carousel", "story"]);
  const ia = client.igAutomation;
  const [perMonth, setPerMonth] = useState(ia?.per_month ?? 8);
  const [weekdays, setWeekdays] = useState<number[]>(ia?.weekdays ?? [1, 3, 5]);
  const [hour, setHour] = useState(ia?.hour ?? 11);
  const [approval, setApproval] = useState<"telegram" | "auto" | "manual">(ia?.approval ?? "telegram");
  const [focus, setFocus] = useState(ia?.focus ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const mode = modeOf({ blogGbp, instagram });
  const dirty = blogGbp !== client.blogGbp || instagram !== client.instagram || linkedin !== client.linkedin || formats.join() !== client.formats.join();

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[18px] font-bold text-ink">{client.name}</h2>
          <Badge tone={MODE[mode].tone}>{MODE[mode].label}</Badge>
        </div>
        <p className="mt-1 text-[13.5px] text-muted">{MODE[mode].text}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Toggle on={blogGbp} onChange={setBlogGbp} label="Blog + Google Empresas" hint="Vendidos juntos: quem contrata o blog leva o Google Empresas, e vice-versa." />
          <Toggle on={instagram} onChange={setInstagram} label="Instagram" hint="Com o blog, os posts saem dos artigos. Sozinho, tem calendário próprio." />
          <Toggle on={linkedin} onChange={setLinkedin} label="LinkedIn" hint="Cada artigo aprovado vira post na página da empresa. Precisa do Blog + Google Empresas." />
        </div>

        {instagram ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-ink">Formatos no Instagram</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["carousel", "Carrossel no feed"],
                  ["story", "Story"],
                ] as const
              ).map(([value, label]) => {
                const on = formats.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFormats((f) => (on ? f.filter((x) => x !== value) : [...f, value]))}
                    className={cn(
                      "h-9 rounded-[var(--radius-chip)] border px-4 text-[13.5px]",
                      on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-muted hover:border-ink hover:text-ink",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button disabled={!dirty} loading={pending} onClick={() => act(() => setServices(client.id, { blogGbp, instagram, linkedin, formats }))}>
            Salvar serviços
          </Button>
          {dirty ? <span className="text-[13px] text-warn">Alterações não salvas</span> : null}
        </div>
      </section>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
        <h3 className="text-[15px] font-semibold text-ink">Conexões</h3>
        <ul className="mt-2 divide-y divide-line">
          {client.blogGbp ? (
            <>
              <Conn
                ok={client.site}
                label="Site do blog"
                detail={client.site ? "Site ativo recebendo os artigos." : "Nenhum site ativo."}
                action={
                  <Link href={`/clientes/${client.id}`} className="text-sm text-muted hover:text-ink">
                    Abrir cliente
                  </Link>
                }
              />
              <Conn
                ok={client.gbpProfiles > 0}
                label="Google Empresas"
                detail={client.gbpProfiles ? `${client.gbpProfiles} perfil(is) ligado(s).` : "Nenhum perfil ligado a este cliente."}
                action={
                  <Link href="/google-empresas" className="text-sm text-muted hover:text-ink">
                    Ligar perfil
                  </Link>
                }
              />
            </>
          ) : null}
          {client.linkedin ? (
            <Conn
              ok={client.liPages > 0}
              label="LinkedIn"
              detail={client.liPages ? `${client.liPages} página(s) ligada(s).` : "Nenhuma página da LinkedIn ligada a este cliente."}
              action={
                <Link href="/linkedin" className="text-sm text-muted hover:text-ink">
                  Ligar página
                </Link>
              }
            />
          ) : null}
          {client.instagram ? (
            <Conn
              ok={client.igConnected}
              label="Instagram"
              detail={client.igConnected ? `Conectado${client.igUser ? ` como @${client.igUser}` : ""}.` : "O cliente ainda não autorizou a conta."}
              action={
                client.igConnected ? null : (
                  <Button variant="secondary" size="sm" onClick={() => copy(client.igLink, "Link do Instagram")}>
                    <Link2 className="size-3.5" aria-hidden />
                    Copiar link
                  </Button>
                )
              }
            />
          ) : null}
          <Conn
            ok={client.telegram}
            label="Telegram para aprovação"
            detail={client.telegram ? "Conversa conectada: artigos e posts chegam para o cliente aprovar." : "Sem conversa conectada."}
            action={
              client.telegram || !client.telegramLink ? null : (
                <Button variant="secondary" size="sm" onClick={() => copy(client.telegramLink!, "Link do Telegram")}>
                  <Link2 className="size-3.5" aria-hidden />
                  Copiar link
                </Button>
              )
            }
          />
        </ul>
      </section>

      {client.blogGbp ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-ink">Calendário</h3>
          <p className="mt-1 text-[13.5px] text-muted">
            {client.blogAutomation ? (client.blogAutomation.active ? "A automação do blog está ligada." : "A automação do blog está pausada.") : "Este cliente ainda não tem automação do blog."}{" "}
            Tudo parte dos artigos: configure datas e quantidade em{" "}
            <Link href="/automacao" className="underline underline-offset-2 hover:text-ink">
              Automação
            </Link>
            .
          </p>
        </section>
      ) : null}
      {client.instagram ? (
        <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{client.blogGbp ? "Posts extras do Instagram" : "Calendário do Instagram"}</h3>
            {ia ? (
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => act(() => runIgNow(client.id))}>
                <Play className="size-3.5" aria-hidden />
                Rodar agora
              </Button>
            ) : null}
          </div>
          {client.blogGbp ? (
            <p className="mt-1 text-[13px] text-muted">
              Cada artigo já vira um post. Aqui entram só os extras para completar o plano: Essencial 4, Crescimento 6, Autoridade 6 por mês.
            </p>
          ) : null}
          {ia?.next_run_at && ia.active ? <p className="mt-1 text-[13px] text-muted">Próximo post em {formatDateTime(ia.next_run_at)}.</p> : null}
          {ia?.last_error ? <p className="mt-1 text-[13px] text-danger">{ia.last_error}</p> : null}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Posts por mês" htmlFor="ig-pm">
              <Input id="ig-pm" type="number" min={1} max={60} value={perMonth} onChange={(e) => setPerMonth(Number(e.target.value))} />
            </Field>
            <Field label="Horário" htmlFor="ig-h" hint="Horário de Brasília.">
              <Select id="ig-h" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset className="mt-4">
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
                      "h-9 rounded-[var(--radius-chip)] border px-3.5 text-[13.5px]",
                      on ? "border-ink bg-ink font-medium text-on-ink" : "border-line-strong text-muted hover:border-ink hover:text-ink",
                    )}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Field label="Foco dos posts (opcional)" htmlFor="ig-focus" hint="Ex.: dicas de cuidado, bastidores, antes e depois, promoções do mês." className="mt-4">
            <Textarea id="ig-focus" rows={2} value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={300} />
          </Field>
          <Field label="Quando o post ficar pronto" htmlFor="ig-ap" className="mt-4">
            <Select id="ig-ap" value={approval} onChange={(e) => setApproval(e.target.value as typeof approval)}>
              <option value="telegram">Cliente aprova pelo Telegram</option>
              <option value="auto">Publicar direto</option>
              <option value="manual">Deixar em rascunho (equipe publica na aba Instagram)</option>
            </Select>
          </Field>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <Button
              loading={pending}
              onClick={() => act(() => saveIgAutomation(client.id, { active: true, perMonth, weekdays, hour, approval, focus: focus || null }))}
            >
              {ia?.active ? "Salvar" : "Salvar e ligar"}
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => act(() => saveIgAutomation(client.id, { active: false, perMonth, weekdays, hour, approval, focus: focus || null }))}
            >
              Salvar pausado
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
