"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Valor somente leitura em mono com botão de copiar (chaves, URLs, snippets). */
export function CopyField({ value, multiline, className, label = "Copiar" }: { value: string; multiline?: boolean; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className={cn("group relative rounded-[var(--radius-control)] border border-line bg-sunken", className)}>
      <pre
        className={cn(
          "overflow-x-auto px-3 py-2.5 pr-12 font-mono text-[12.5px] leading-relaxed text-text",
          multiline ? "whitespace-pre" : "whitespace-nowrap",
        )}
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copiado" : label}
        className="absolute top-1.5 right-1.5 inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
