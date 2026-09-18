"use client";

import { useEffect, useId, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { articleExtensions } from "./extensions";
import { ClientDot } from "./primitives";
import { EditorToolbar } from "./toolbar";
import { DuplicateNotice, hasVariation } from "./destinations-section";
import type { DestinationDraft, DestinationSite } from "./types";

type OverridePatch = Partial<Omit<DestinationDraft, "siteId" | "isCanonical">>;

function MiniEditor({ value, onChange, labelledBy }: { value: string; onChange: (html: string) => void; labelledBy: string }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: articleExtensions("Deixe vazio para usar o texto principal"),
    content: value,
    editorProps: {
      attributes: {
        class: "prose-article tiptap min-h-40 px-3 py-3 text-[16px]! leading-relaxed!",
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  // valor trocado por fora (IA, copiar texto principal, limpar)
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-line-strong bg-surface focus-within:border-ink">
      {editor ? <EditorToolbar editor={editor} compact className="bg-sunken" /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function VariationBlock({
  site,
  dest,
  mainHtml,
  aiEnabled,
  generating,
  onChange,
  onGenerate,
}: {
  site: DestinationSite;
  dest: DestinationDraft;
  mainHtml: string;
  aiEnabled: boolean | null;
  generating: boolean;
  onChange: (patch: OverridePatch) => void;
  onGenerate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const contentLabel = useId();
  const custom = hasVariation(dest);
  const p = `var-${site.id}`;

  return (
    <li className="rounded-[var(--radius-control)] border border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-3 text-left"
      >
        <ClientDot color={site.client.brand_color} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{site.name}</span>
        {custom ? <Badge tone="info">Personalizado</Badge> : <span className="text-[12.5px] text-muted">Texto principal</span>}
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted transition-transform", open ? "rotate-180" : "")} />
      </button>
      <div id={bodyId} hidden={!open} className="space-y-4 border-t border-line px-3 py-4">
        <div className="space-y-1.5">
          <Button
            variant="secondary"
            className="w-full justify-center"
            onClick={onGenerate}
            loading={generating}
            disabled={aiEnabled !== true}
          >
            {generating ? null : <Sparkles className="size-4" aria-hidden />}
            {generating ? "Gerando variação…" : "Gerar variação com IA"}
          </Button>
          <p className="text-[12.5px] text-muted">
            {aiEnabled === false
              ? "Configure ANTHROPIC_API_KEY para ativar"
              : "Adapta tom, cidade e palavras-chave ao cliente. Revise antes de publicar."}
          </p>
        </div>
        <Field label="Título" htmlFor={`${p}-title`}>
          <Input id={`${p}-title`} value={dest.overrideTitle} onChange={(e) => onChange({ overrideTitle: e.target.value })} placeholder="Usa o título principal" />
        </Field>
        <Field label="Resumo" htmlFor={`${p}-excerpt`}>
          <Textarea
            id={`${p}-excerpt`}
            rows={2}
            value={dest.overrideExcerpt}
            onChange={(e) => onChange({ overrideExcerpt: e.target.value })}
            placeholder="Usa o resumo principal"
          />
        </Field>
        <Field label="Título SEO" htmlFor={`${p}-seo-title`}>
          <Input
            id={`${p}-seo-title`}
            value={dest.overrideSeoTitle}
            onChange={(e) => onChange({ overrideSeoTitle: e.target.value })}
            placeholder="Usa o título SEO principal"
          />
        </Field>
        <Field label="Meta descrição" htmlFor={`${p}-seo-desc`}>
          <Textarea
            id={`${p}-seo-desc`}
            rows={2}
            value={dest.overrideSeoDescription}
            onChange={(e) => onChange({ overrideSeoDescription: e.target.value })}
            placeholder="Usa a meta descrição principal"
          />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span id={contentLabel} className="text-sm font-medium text-ink">
              Texto
            </span>
            {!dest.overrideContentHtml ? (
              <Button variant="ghost" size="sm" className="h-10" onClick={() => onChange({ overrideContentHtml: mainHtml })} disabled={!mainHtml}>
                Copiar texto principal
              </Button>
            ) : null}
          </div>
          {open ? <MiniEditor value={dest.overrideContentHtml} onChange={(html) => onChange({ overrideContentHtml: html })} labelledBy={contentLabel} /> : null}
        </div>
        {custom ? (
          <Button
            variant="ghost"
            onClick={() =>
              onChange({ overrideTitle: "", overrideExcerpt: "", overrideContentHtml: "", overrideSeoTitle: "", overrideSeoDescription: "" })
            }
          >
            Limpar variação
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function VariationsSection({
  sites,
  destinations,
  mainHtml,
  aiEnabled,
  generatingSiteId,
  onChange,
  onGenerate,
}: {
  sites: DestinationSite[];
  destinations: DestinationDraft[];
  mainHtml: string;
  aiEnabled: boolean | null;
  generatingSiteId: string | null;
  onChange: (siteId: string, patch: OverridePatch) => void;
  onGenerate: (siteId: string) => void;
}) {
  const byId = new Map(sites.map((s) => [s.id, s]));
  if (!destinations.length) {
    return <p className="text-sm text-muted">Escolha os destinos primeiro. Aqui você adapta título e texto para cada site.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-snug text-muted">
        Campos vazios usam o texto principal. Variações ajudam cada site a ter conteúdo próprio.
      </p>
      <DuplicateNotice destinations={destinations} />
      <ul className="space-y-2">
        {destinations.map((dest) => {
          const site = byId.get(dest.siteId);
          if (!site) return null;
          return (
            <VariationBlock
              key={dest.siteId}
              site={site}
              dest={dest}
              mainHtml={mainHtml}
              aiEnabled={aiEnabled}
              generating={generatingSiteId === dest.siteId}
              onChange={(patch) => onChange(dest.siteId, patch)}
              onGenerate={() => onGenerate(dest.siteId)}
            />
          );
        })}
      </ul>
    </div>
  );
}
