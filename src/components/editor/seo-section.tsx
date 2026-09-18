"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  SEO_DESCRIPTION_MAX,
  SEO_DESCRIPTION_MIN,
  SEO_TITLE_MAX,
  type SeoReport,
} from "@/lib/seo";
import { cn, hostname, slugify } from "@/lib/utils";
import { CharCounter } from "./primitives";
import type { DestinationSite } from "./types";

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function SeoSection({
  report,
  focusKeyword,
  seoTitle,
  seoDescription,
  slug,
  slugTouched,
  title,
  excerpt,
  published,
  previewSite,
  onChange,
  onResetSlug,
}: {
  report: SeoReport;
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
  slug: string;
  slugTouched: boolean;
  title: string;
  excerpt: string;
  published: boolean;
  previewSite: DestinationSite | null;
  onChange: (patch: { focusKeyword?: string; seoTitle?: string; seoDescription?: string; slug?: string }) => void;
  onResetSlug: () => void;
}) {
  const host = previewSite ? hostname(previewSite.url) : "seusite.com.br";
  const pathParts = [...(previewSite?.blog_path ?? "/blog").split("/").filter(Boolean), slug || "endereco-do-artigo"];
  const unmet = report.checks.filter((c) => !c.ok);
  const unmetGeneral = unmet.filter((c) => !c.keyword);
  const unmetKeyword = unmet.filter((c) => c.keyword);
  const pct = Math.round((report.score / report.total) * 100);

  return (
    <div className="space-y-5">
      <Field label="Palavra-chave foco" htmlFor="seo-keyword" hint="O termo que as pessoas buscam no Google para achar este artigo.">
        <Input
          id="seo-keyword"
          value={focusKeyword}
          onChange={(e) => onChange({ focusKeyword: e.target.value })}
          placeholder="Ex.: móveis planejados em Curitiba"
        />
      </Field>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="seo-title" className="text-sm font-medium text-ink">
            Título SEO
          </label>
          <CharCounter value={seoTitle || title} max={SEO_TITLE_MAX} id="seo-title-count" />
        </div>
        <Input
          id="seo-title"
          value={seoTitle}
          onChange={(e) => onChange({ seoTitle: e.target.value })}
          placeholder={title || "Usa o título do artigo"}
          aria-describedby="seo-title-count"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="seo-desc" className="text-sm font-medium text-ink">
            Meta descrição
          </label>
        </div>
        <Textarea
          id="seo-desc"
          rows={3}
          value={seoDescription}
          onChange={(e) => onChange({ seoDescription: e.target.value })}
          placeholder={excerpt || "Resumo que aparece abaixo do título no Google"}
          aria-describedby="seo-desc-count"
        />
        <CharCounter value={seoDescription || excerpt} min={SEO_DESCRIPTION_MIN} max={SEO_DESCRIPTION_MAX} id="seo-desc-count" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="seo-slug" className="block text-sm font-medium text-ink">
          Endereço (slug)
        </label>
        <Input
          id="seo-slug"
          value={slug}
          onChange={(e) => onChange({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
          onBlur={(e) => onChange({ slug: slugify(e.target.value) })}
          spellCheck={false}
          className="font-mono text-[13.5px]"
          aria-describedby="seo-slug-hint"
        />
        <div id="seo-slug-hint" className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
          <span>
            {published
              ? "Mudar o endereço de um artigo publicado quebra links já compartilhados."
              : slugTouched
                ? "Editado à mão."
                : "Gerado a partir do título."}
          </span>
          {slugTouched && !published ? (
            <Button variant="ghost" size="sm" className="h-10" onClick={onResetSlug}>
              Gerar do título
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Prévia no Google</p>
        <div className="rounded-[var(--radius-control)] border border-line bg-sunken p-3.5" aria-label="Prévia do resultado no Google">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[12px] font-semibold text-muted">
              {(previewSite?.name ?? host).slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] text-ink">{previewSite?.name ?? "Site do cliente"}</span>
              <span className="block truncate text-[12px] text-muted">
                https://{host} › {pathParts.join(" › ")}
              </span>
            </span>
          </div>
          <p className="mt-2 text-[17px] leading-snug text-info">
            {truncate(report.effectiveTitle || "Título do artigo", SEO_TITLE_MAX + 5)}
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {report.effectiveDescription
              ? truncate(report.effectiveDescription, SEO_DESCRIPTION_MAX + 5)
              : "Escreva a meta descrição para controlar o que aparece aqui."}
          </p>
        </div>
        {!previewSite ? <p className="mt-1.5 text-[12.5px] text-muted">Escolha um destino para ver o endereço real.</p> : null}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">Checklist de SEO</p>
          <p className="text-sm font-semibold text-ink tabular-nums">
            {report.score} de {report.total}
          </p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
          role="meter"
          aria-label="Pontuação de SEO"
          aria-valuemin={0}
          aria-valuemax={report.total}
          aria-valuenow={report.score}
          aria-valuetext={`${report.score} de ${report.total} itens atendidos`}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-300", pct >= 80 ? "bg-ok" : pct >= 50 ? "bg-warn" : "bg-danger")}
            style={{ width: `${pct}%` }}
          />
        </div>

        {unmet.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-ok">
            <CircleCheck className="size-4" aria-hidden /> Tudo certo. O artigo atende a todos os itens.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {!report.hasKeyword ? (
              <li className="flex gap-2 text-[13px] leading-snug text-text">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>
                  Defina a palavra-chave foco para avaliar mais {unmetKeyword.length} itens.
                </span>
              </li>
            ) : (
              unmetKeyword.map((c) => (
                <li key={c.id} className="flex gap-2 text-[13px] leading-snug text-text">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                  <span>{c.hint}</span>
                </li>
              ))
            )}
            {unmetGeneral.map((c) => (
              <li key={c.id} className="flex gap-2 text-[13px] leading-snug text-text">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>{c.hint}</span>
              </li>
            ))}
          </ul>
        )}
        {report.score > 0 && unmet.length > 0 ? (
          <details className="mt-3 text-[13px]">
            <summary className="inline-flex h-10 cursor-pointer items-center font-medium text-muted hover:text-ink">
              Ver {report.score} {report.score === 1 ? "item atendido" : "itens atendidos"}
            </summary>
            <ul className="mt-1 space-y-1.5">
              {report.checks
                .filter((c) => c.ok)
                .map((c) => (
                  <li key={c.id} className="flex gap-2 text-muted">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                    {c.label}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
