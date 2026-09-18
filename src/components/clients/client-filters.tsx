"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import type { ClientStatus } from "@/lib/types";
import { CLIENT_STATUS, CLIENT_STATUSES } from "./options";

type Filters = { q: string; status: string };

const same = (a: Filters, b: Filters) => a.q === b.q && a.status === b.status;

/** Busca e filtro de status da lista de clientes, refletidos em `?q=` e `?status=`. */
export function ClientFilters({ q, status }: { q: string; status: ClientStatus | "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [text, setText] = useState(q);
  const [selected, setSelected] = useState<string>(status);
  // Filtros que vieram da URL por último e os que este componente enviou,
  // para refletir mudanças externas (ex.: "Limpar filtros") sem atropelar o que está sendo digitado.
  const [seen, setSeen] = useState<Filters>({ q, status });
  const [pushed, setPushed] = useState<Filters[]>([]);
  if (!same(seen, { q, status })) {
    setSeen({ q, status });
    const index = pushed.findIndex((p) => same(p, { q, status }));
    if (index >= 0) {
      setPushed(pushed.slice(index + 1));
    } else {
      setText(q);
      setSelected(status);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function apply(next: Filters) {
    const params = new URLSearchParams();
    const nextQ = next.q.trim().slice(0, 100);
    if (nextQ) params.set("q", nextQ);
    if (next.status) params.set("status", next.status);
    if (same(seen, { q: nextQ, status: next.status })) return;
    setPushed((list) => [...list, { q: nextQ, status: next.status }]);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    apply({ q: text, status: selected });
  }

  return (
    <form role="search" method="get" onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-[420px]">
        <label htmlFor="clientes-busca" className="sr-only">
          Buscar clientes
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input
          id="clientes-busca"
          name="q"
          type="search"
          value={text}
          maxLength={100}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => apply({ q: value, status: selected }), 250);
          }}
          placeholder="Buscar por nome, segmento, cidade ou site"
          autoComplete="off"
          className="pr-9 pl-9"
        />
        {pending ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-label="Carregando" />
        ) : null}
      </div>
      <label htmlFor="clientes-status" className="sr-only">
        Status
      </label>
      <Select
        id="clientes-status"
        name="status"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          apply({ q: text, status: e.target.value });
        }}
        className="sm:w-48"
      >
        <option value="">Todos os status</option>
        {CLIENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CLIENT_STATUS[s].filter}
          </option>
        ))}
      </Select>
    </form>
  );
}
