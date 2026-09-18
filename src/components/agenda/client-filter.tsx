"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Filtro de cliente que preserva o mês e navega ao trocar. */
export function ClientFilter({
  basePath,
  params,
  clients,
  value,
  className,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  clients: { id: string; name: string }[];
  value: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor="filtro-cliente" className="text-sm font-medium text-ink">
        Cliente
      </label>
      <Select
        id="filtro-cliente"
        value={value}
        aria-busy={pending || undefined}
        className="w-full sm:w-56"
        onChange={(e) => {
          const next = new URLSearchParams();
          for (const [k, v] of Object.entries(params)) if (v) next.set(k, v);
          if (e.target.value) next.set("cliente", e.target.value);
          else next.delete("cliente");
          const qs = next.toString();
          start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
        }}
      >
        <option value="">Todos os clientes</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
