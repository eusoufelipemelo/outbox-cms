"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Copy, ExternalLink, Eye, MessageCircle, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { blockClientAccess, grantClientAccess, inviteClientEmail, removeClientInvite } from "@/lib/data/client-access-actions";
import type { ClientAccessRow, ClientInviteRow } from "@/lib/data/client-access";
import type { ActionResult } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

type Company = { id: string; name: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Palpite da empresa pelo nome que a pessoa digitou no cadastro. */
function guessCompany(typed: string | null, companies: Company[]): string {
  if (!typed) return "";
  const t = norm(typed);
  if (!t) return "";
  const hit = companies.find((c) => norm(c.name) === t) ?? companies.find((c) => norm(c.name).includes(t) || t.includes(norm(c.name)));
  return hit?.id ?? "";
}

function whatsappLink(phone: string | null, name: string | null, url: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const first = (name ?? "").split(" ")[0];
  const text = `Olá${first ? `, ${first}` : ""}! Seu acesso à área do cliente da OutBox foi liberado. Entre com o seu e-mail e senha em ${url}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function ClientAccessManager({
  url,
  accounts,
  invites,
  companies,
}: {
  url: string;
  accounts: ClientAccessRow[];
  invites: ClientInviteRow[];
  companies: Company[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pendingAccounts = accounts.filter((a) => a.status === "pending");
  const active = accounts.filter((a) => a.status === "active");
  const blocked = accounts.filter((a) => a.status === "blocked");
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(pendingAccounts.map((a) => [a.id, guessCompany(a.companyName, companies)])),
  );
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [justGranted, setJustGranted] = useState<ClientAccessRow | null>(null);
  const [previewId, setPreviewId] = useState("");

  const byCompany = useMemo(() => {
    const map = new Map<string, ClientAccessRow[]>();
    for (const a of active) {
      const key = a.clientName ?? "Sem empresa";
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [active]);

  const act = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Feito");
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
        <h2 className="text-[16px] font-semibold text-ink">Link da área do cliente</h2>
        <p className="mt-1 text-[14px] text-muted">
          O mesmo link para todos os clientes. Cada um cria o próprio login no primeiro acesso, e você liga o cadastro à empresa dele aqui.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-[var(--radius-control)] border border-line bg-sunken px-3 py-2 text-[14px] text-ink">{url}</code>
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="size-3.5" aria-hidden />
            Copiar link
          </Button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 px-2 text-sm text-muted hover:text-ink">
            <ExternalLink className="size-3.5" aria-hidden />
            Abrir
          </a>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[14px] font-medium text-ink">Ver como o cliente</p>
          <p className="mt-0.5 text-[13.5px] text-muted">Abre a área exatamente como o cliente vê, sem a senha dele. Os botões de decisão ficam travados. Bom para conferir e para demonstrações.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select aria-label="Cliente para visualizar" className="w-[260px]" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              <option value="">Escolha o cliente</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <a
              href={previewId ? `/api/cliente-preview?c=${previewId}` : undefined}
              aria-disabled={!previewId}
              className={
                previewId
                  ? "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] bg-ink px-4 text-sm font-medium text-on-ink hover:bg-ink-hover"
                  : "pointer-events-none inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] bg-ink px-4 text-sm font-medium text-on-ink opacity-50"
              }
            >
              <Eye className="size-4" aria-hidden />
              Ver como o cliente
            </a>
          </div>
        </div>
      </section>

      {justGranted ? (
        <section className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-ok/30 bg-ok-soft p-4">
          <Check className="size-5 text-ok" aria-hidden />
          <p className="min-w-0 flex-1 text-[14.5px] text-ink">
            Acesso de <strong>{justGranted.name ?? justGranted.email}</strong> liberado. Avise a pessoa para entrar.
          </p>
          {whatsappLink(justGranted.phone, justGranted.name, url) ? (
            <a
              href={whatsappLink(justGranted.phone, justGranted.name, url)!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-ink px-3 text-[13px] font-medium text-on-ink hover:bg-ink-hover"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              Avisar no WhatsApp
            </a>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setJustGranted(null)}>
            Fechar
          </Button>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface">
        <div className="px-5 pt-5">
          <h2 className="text-[16px] font-semibold text-ink">
            Pedidos de acesso {pendingAccounts.length ? <Badge tone="warn">{pendingAccounts.length}</Badge> : null}
          </h2>
          <p className="mt-1 text-[14px] text-muted">Quem fez o primeiro acesso e ainda não está ligado a uma empresa. Confira o nome e o e-mail antes de liberar.</p>
        </div>
        {pendingAccounts.length ? (
          <ul className="mt-3 divide-y divide-line">
            {pendingAccounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-end gap-3 px-5 py-4">
                <div className="min-w-[220px] flex-1">
                  <p className="text-[15px] font-semibold text-ink">{a.name ?? "Sem nome"}</p>
                  <p className="text-[13.5px] text-text">
                    {a.email}
                    {a.phone ? `, WhatsApp ${a.phone}` : ""}
                  </p>
                  <p className="text-[13px] text-muted">
                    Empresa informada: <span className="text-text">{a.companyName ?? "não informou"}</span>, em {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <div className="w-full sm:w-[260px]">
                  <label htmlFor={`emp-${a.id}`} className="mb-1 block text-[13px] font-medium text-ink">
                    Ligar à empresa
                  </label>
                  <Select id={`emp-${a.id}`} value={choice[a.id] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [a.id]: e.target.value }))}>
                    <option value="">Escolha o cliente</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="md"
                    disabled={pending || !choice[a.id]}
                    onClick={() => act(() => grantClientAccess(a.id, choice[a.id]), () => setJustGranted(a))}
                  >
                    <Check className="size-4" aria-hidden />
                    Liberar
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Recusar o acesso de ${a.name ?? a.email}? A pessoa não consegue mais entrar.`)) act(() => blockClientAccess(a.id));
                    }}
                  >
                    Recusar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pt-2 pb-5 text-[14px] text-muted">Nenhum pedido esperando.</p>
        )}
      </section>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5">
        <h2 className="text-[16px] font-semibold text-ink">Liberar um e-mail antes do cadastro</h2>
        <p className="mt-1 text-[14px] text-muted">Quem se cadastrar com este e-mail e confirmar entra direto na empresa escolhida, sem esperar você.</p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => inviteClientEmail(inviteEmail, inviteCompany), () => {
              setInviteEmail("");
              setInviteCompany("");
            });
          }}
        >
          <Field label="E-mail do cliente" htmlFor="convite-email" className="min-w-[240px] flex-1">
            <Input id="convite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="nome@empresa.com.br" />
          </Field>
          <Field label="Empresa" htmlFor="convite-empresa" className="w-full sm:w-[260px]">
            <Select id="convite-empresa" value={inviteCompany} onChange={(e) => setInviteCompany(e.target.value)}>
              <option value="">Escolha o cliente</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={pending || !inviteEmail || !inviteCompany}>
            <UserPlus className="size-4" aria-hidden />
            Liberar e-mail
          </Button>
        </form>
        {invites.length ? (
          <ul className="mt-4 divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {invites.map((i) => (
              <li key={i.email} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                <span className="min-w-0 flex-1 truncate text-ink">{i.email}</span>
                <span className="text-muted">{i.clientName}</span>
                <span className="hidden text-[12.5px] text-faint sm:inline">ainda não se cadastrou</span>
                <button
                  type="button"
                  aria-label={`Remover a liberação de ${i.email}`}
                  disabled={pending}
                  onClick={() => act(() => removeClientInvite(i.email))}
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-danger"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-panel)] border border-line bg-surface">
        <div className="px-5 pt-5">
          <h2 className="text-[16px] font-semibold text-ink">Quem tem acesso</h2>
          <p className="mt-1 text-[14px] text-muted">Cada pessoa vê só os artigos e temas da própria empresa.</p>
        </div>
        {byCompany.length ? (
          <div className="mt-3 divide-y divide-line">
            {byCompany.map(([company, list]) => (
              <div key={company} className="px-5 py-4">
                <p className="text-[14.5px] font-semibold text-ink">{company}</p>
                <ul className="mt-2 space-y-2">
                  {list.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px]">
                      <span className="text-ink">{a.name ?? a.email}</span>
                      <span className="text-muted">{a.email}</span>
                      {a.approvedAt ? <span className="text-[12.5px] text-faint">desde {formatDate(a.approvedAt)}</span> : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Bloquear o acesso de ${a.name ?? a.email}?`)) act(() => blockClientAccess(a.id));
                        }}
                      >
                        <Ban className="size-3.5" aria-hidden />
                        Bloquear
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 pt-2 pb-5 text-[14px] text-muted">Ninguém com acesso ainda. Mande o link acima para o responsável de cada cliente.</p>
        )}
        {blocked.length ? (
          <details className="border-t border-line px-5 py-4 text-[14px]">
            <summary className="cursor-pointer text-muted hover:text-ink">Bloqueados ({blocked.length})</summary>
            <ul className="mt-3 space-y-2">
              {blocked.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-ink">{a.name ?? a.email}</span>
                  <span className="text-muted">{a.email}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <Select
                      aria-label={`Empresa para ${a.name ?? a.email}`}
                      className="h-8 w-[200px] text-[13px]"
                      value={choice[a.id] ?? a.clientId ?? ""}
                      onChange={(e) => setChoice((c) => ({ ...c, [a.id]: e.target.value }))}
                    >
                      <option value="">Escolha o cliente</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending || !(choice[a.id] ?? a.clientId)}
                      onClick={() => act(() => grantClientAccess(a.id, (choice[a.id] ?? a.clientId)!))}
                    >
                      Liberar de novo
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
