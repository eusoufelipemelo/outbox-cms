"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Mês e ano da agenda em dois seletores (vai direto para qualquer mês, sem clicar seta por seta). */
export function MonthPicker({ month, cliente }: { month: string; cliente?: string }) {
  const router = useRouter();
  const [y, m] = month.split("-").map(Number);
  const now = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, i) => now - 3 + i);
  if (!years.includes(y)) years.push(y);

  const go = (year: number, mon: number) => {
    const qs = new URLSearchParams({ m: `${year}-${String(mon).padStart(2, "0")}` });
    if (cliente) qs.set("cliente", cliente);
    router.push(`/agenda?${qs}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Select aria-label="Mês" value={m} onChange={(e) => go(y, Number(e.target.value))} className="w-36">
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </option>
        ))}
      </Select>
      <Select aria-label="Ano" value={y} onChange={(e) => go(Number(e.target.value), m)} className="w-24">
        {years.sort().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </Select>
    </div>
  );
}
