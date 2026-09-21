"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Medindo a velocidade no Google PageSpeed e lendo o site",
  "Procurando a empresa no Google Empresas",
  "Escrevendo o relatório e o plano de 6 a 12 meses",
];

/** Enquanto o diagnóstico roda, recarrega os dados da página a cada 4 s. */
export function LiveProgress({ step }: { step: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);

  const current = Math.max(0, STEPS.indexOf(step ?? ""));
  return (
    <ol className="space-y-3" aria-live="polite">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn("flex items-center gap-3 text-[15px]", done ? "text-muted" : active ? "font-medium text-ink" : "text-faint")}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border",
                done ? "border-ok bg-ok-soft text-ok" : active ? "border-ink" : "border-line-strong",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : active ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
