"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { saveUnits } from "@/lib/data/unit-actions";
import { UFS } from "./options";
import type { ClientUnit } from "@/lib/types";

const empty = (): ClientUnit => ({ id: crypto.randomUUID(), label: "", address: null, city: "", state: null, phone: null, manager: null, maps_name: null });

/** Matriz (endereço principal do cadastro) + filiais e outras unidades. */
export function UnitsPanel({
  clientId,
  units: initial,
  headquarters,
}: {
  clientId: string;
  units: ClientUnit[];
  headquarters: string | null;
}) {
  const [units, setUnits] = useState(initial);
  const [editing, setEditing] = useState<ClientUnit | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const persist = (next: ClientUnit[], message: string) =>
    start(async () => {
      const r = await saveUnits(clientId, next);
      if (r.ok) {
        setUnits(next);
        setEditing(null);
        toast.success(message);
        router.refresh();
      } else toast.error(r.error);
    });

  const submit = () => {
    if (!editing) return;
    const exists = units.some((u) => u.id === editing.id);
    persist(exists ? units.map((u) => (u.id === editing.id ? editing : u)) : [...units, editing], exists ? "Unidade atualizada" : "Unidade adicionada");
  };

  const set = <K extends keyof ClientUnit>(key: K, value: ClientUnit[K]) => setEditing((e) => (e ? { ...e, [key]: value } : e));

  return (
    <Panel
      title="Unidades"
      description="Matriz e filiais. Entram nas pautas locais, no mapa, nos dados da empresa no site e no diagnóstico."
      actions={
        editing ? null : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(empty())}>
            <Plus className="size-4" aria-hidden />
            Adicionar unidade
          </Button>
        )
      }
    >
      <ul className="divide-y divide-line">
        <li className="flex items-start gap-3 py-2.5 first:pt-0">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold text-ink">Matriz</p>
            <p className="text-[13px] text-muted">{headquarters ?? "Preencha cidade e UF no cadastro abaixo."}</p>
          </div>
        </li>
        {units.map((u) => (
          <li key={u.id} className="flex items-start gap-3 py-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold text-ink">{u.label}</p>
              <p className="text-[13px] text-muted">
                {[u.address, u.state ? `${u.city}/${u.state}` : u.city].filter(Boolean).join(", ")}
                {u.manager ? `. Responsável: ${u.manager}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Editar ${u.label}`} onClick={() => setEditing(u)} disabled={pending}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover ${u.label}`}
              disabled={pending}
              onClick={() => {
                if (confirm(`Remover a unidade ${u.label}?`)) persist(units.filter((x) => x.id !== u.id), "Unidade removida");
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-line bg-sunken p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da unidade" htmlFor="u-label" hint="Ex.: Filial Brasília, Loja Centro.">
              <Input id="u-label" value={editing.label} onChange={(e) => set("label", e.target.value)} autoFocus />
            </Field>
            <Field label="Responsável" htmlFor="u-manager" hint="Representante ou gerente da unidade.">
              <Input id="u-manager" value={editing.manager ?? ""} onChange={(e) => set("manager", e.target.value)} />
            </Field>
            <Field label="Endereço" htmlFor="u-address" className="sm:col-span-2">
              <Input id="u-address" value={editing.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Rua, número, bairro" />
            </Field>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 sm:col-span-2">
              <Field label="Cidade" htmlFor="u-city">
                <Input id="u-city" value={editing.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="UF" htmlFor="u-state">
                <Select id="u-state" value={editing.state ?? ""} onChange={(e) => set("state", e.target.value || null)}>
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Telefone" htmlFor="u-phone">
              <Input id="u-phone" value={editing.phone ?? ""} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
            </Field>
            <Field label="Nome no Google Maps" htmlFor="u-maps" hint="Só se o perfil desta unidade tiver outro nome." className="sm:col-span-2">
              <Input id="u-maps" value={editing.maps_name ?? ""} onChange={(e) => set("maps_name", e.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={submit} loading={pending}>
              Salvar unidade
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
