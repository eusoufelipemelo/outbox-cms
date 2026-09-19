"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CONTENT_TYPES } from "@/lib/geo";
import type { ContentType } from "@/lib/types";
import { CharCounter } from "./primitives";

function TagInput({ id, tags, onChange }: { id: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [value, setValue] = useState("");
  const add = (raw: string) => {
    const next = raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!next.length) return;
    const merged = [...tags];
    for (const t of next) if (!merged.some((m) => m.toLowerCase() === t.toLowerCase()) && merged.length < 30) merged.push(t.slice(0, 60));
    onChange(merged);
    setValue("");
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1.5 transition-colors focus-within:border-ink focus-within:ring-2 focus-within:ring-brand/25">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] bg-sunken py-0.5 pr-0.5 pl-2.5 text-[13px] text-ink">
          {tag}
          <button
            type="button"
            aria-label={`Remover tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted after:absolute after:-inset-2 after:content-[''] hover:bg-line hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v.includes(",")) add(v);
          else setValue(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(value);
          } else if (e.key === "Backspace" && !value && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => add(value)}
        placeholder={tags.length ? "" : "Digite e aperte Enter"}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-[15px] text-text placeholder:text-faint focus:outline-none"
      />
    </div>
  );
}

export function DetailsSection({
  excerpt,
  category,
  tags,
  authorName,
  contentType,
  scheduledLocal,
  categories,
  defaultAuthor,
  scheduleLocked,
  onChange,
}: {
  excerpt: string;
  category: string;
  tags: string[];
  authorName: string;
  contentType: ContentType;
  scheduledLocal: string;
  categories: string[];
  defaultAuthor: string;
  scheduleLocked: boolean;
  onChange: (patch: {
    excerpt?: string;
    category?: string;
    tags?: string[];
    authorName?: string;
    contentType?: ContentType;
    scheduledLocal?: string;
  }) => void;
}) {
  const listId = useId();
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="post-excerpt" className="block text-sm font-medium text-ink">
          Resumo
        </label>
        <Textarea
          id="post-excerpt"
          rows={3}
          value={excerpt}
          onChange={(e) => onChange({ excerpt: e.target.value })}
          placeholder="Uma ou duas frases que aparecem na lista de artigos do blog"
          aria-describedby="post-excerpt-count"
        />
        <CharCounter value={excerpt} max={300} id="post-excerpt-count" />
      </div>

      <Field
        label="Tipo de conteúdo"
        htmlFor="post-content-type"
        hint="Ajuda buscadores e IAs a entender o formato do artigo."
      >
        <Select id="post-content-type" value={contentType} onChange={(e) => onChange({ contentType: e.target.value as ContentType })}>
          {CONTENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Categoria" htmlFor="post-category">
        <Input
          id="post-category"
          list={listId}
          value={category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Ex.: Dicas"
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <Field label="Tags" htmlFor="post-tags" hint="Separe com vírgula ou Enter.">
        <TagInput id="post-tags" tags={tags} onChange={(next) => onChange({ tags: next })} />
      </Field>

      <Field label="Autor" htmlFor="post-author" hint="Nome exibido no artigo. Prefira o especialista do cliente. Se ficar vazio, cada site usa o autor padrão.">
        <Input id="post-author" value={authorName} onChange={(e) => onChange({ authorName: e.target.value })} placeholder={defaultAuthor} />
      </Field>

      <Field
        label="Data de publicação"
        htmlFor="post-schedule"
        hint={
          scheduleLocked
            ? "O artigo já foi publicado."
            : "Horário de Brasília. Use Agendar no topo para publicar automaticamente nessa data."
        }
      >
        <Input
          id="post-schedule"
          type="datetime-local"
          value={scheduledLocal}
          disabled={scheduleLocked}
          onChange={(e) => onChange({ scheduledLocal: e.target.value })}
        />
      </Field>
    </div>
  );
}
