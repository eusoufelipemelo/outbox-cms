"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";

export function ArticleFilters({
  status,
  q,
  clientId,
  clients,
}: {
  status: string;
  q: string;
  clientId: string;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const first = useRef(true);

  // busca trocada por fora (ex.: "Limpar filtros")
  if (q !== lastQ) {
    setLastQ(q);
    if (q !== text.trim()) setText(q);
  }

  const go = (next: { q?: string; cliente?: string }) => {
    const params = new URLSearchParams();
    if (status !== "todos") params.set("status", status);
    const nq = next.q ?? text;
    const nc = next.cliente ?? clientId;
    if (nq.trim()) params.set("q", nq.trim());
    if (nc) params.set("cliente", nc);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // busca enquanto digita, com pausa
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => go({ q: text }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao texto digitado
  }, [text]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go({ q: text });
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <div className="relative flex-1">
        <label htmlFor="artigos-busca" className="sr-only">
          Buscar por título
        </label>
        {pending ? (
          <LoaderCircle className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-faint" aria-hidden />
        ) : (
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
        )}
        <Input
          id="artigos-busca"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar por título"
          className="pl-9"
        />
      </div>
      <div className="sm:w-64">
        <label htmlFor="artigos-cliente" className="sr-only">
          Filtrar por cliente
        </label>
        <Select id="artigos-cliente" value={clientId} onChange={(e) => go({ cliente: e.target.value })}>
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
    </form>
  );
}
