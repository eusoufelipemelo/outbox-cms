"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Campo de etiquetas: Enter ou vírgula adicionam, Backspace no campo vazio remove a última.
 * Envia cada etiqueta como `name` e o texto ainda não confirmado como `${name}_draft`.
 */
export function KeywordInput({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
}: {
  id: string;
  name: string;
  defaultValue: string[];
  invalid?: boolean;
  describedBy?: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((current) => {
      const next = [...current];
      for (const p of parts) {
        if (p.length <= 60 && !next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      return next;
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1.5 transition-colors duration-150 hover:border-line-hover focus-within:border-ink focus-within:ring-2 focus-within:ring-brand/25",
        invalid && "border-danger",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-sunken pr-0.5 pl-2.5 text-[13px] text-text"
        >
          {tag}
          <input type="hidden" name={name} value={tag} />
          <button
            type="button"
            onClick={() => setTags((current) => current.filter((t) => t !== tag))}
            aria-label={`Remover palavra-chave ${tag}`}
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-line hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        name={`${name}_draft`}
        value={draft}
        onChange={(e) => {
          const value = e.target.value;
          if (value.includes(",")) {
            add(value);
            setDraft("");
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={tags.length === 0 ? "Digite e tecle Enter, como móveis planejados" : "Adicionar outra"}
        className="h-7 min-w-[10ch] flex-1 bg-transparent px-1 text-[15px] text-text placeholder:text-faint focus:outline-none"
      />
    </div>
  );
}
