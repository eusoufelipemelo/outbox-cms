"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import type { Media } from "@/lib/types";

// Geração de imagem com IA (Gemini) dentro do CMS. A imagem gerada entra na Mídia e já fica
// selecionada para receber o texto alternativo.

const STYLES = [
  { value: "fotografia realista, luz natural, profundidade de campo rasa, sem texto", label: "Fotografia realista" },
  { value: "fotografia editorial premium, iluminação dramática, alto contraste, sem texto", label: "Editorial premium" },
  { value: "ilustração vetorial moderna, formas simples, paleta reduzida, sem texto", label: "Ilustração" },
  { value: "render 3D limpo, materiais suaves, fundo neutro, sem texto", label: "3D" },
  { value: "composição minimalista, muito espaço vazio, fundo liso, sem texto", label: "Minimalista" },
] as const;

// Preço por imagem na tabela do Google, convertido a R$ 5,50 (só para orientar a escolha).
const MODELS = [
  {
    value: "gemini-3-pro-image",
    label: "Pro (máxima qualidade)",
    sizes: ["2K", "4K"] as const,
    price: { "1K": "R$ 0,74", "2K": "R$ 0,74", "4K": "R$ 1,32" } as Record<string, string>,
    note: "Melhor em cenas complexas e texto na imagem. Mais lento.",
  },
  {
    value: "gemini-3.1-flash-image",
    label: "Flash (equilibrado)",
    sizes: ["1K", "2K", "4K"] as const,
    price: { "1K": "R$ 0,37", "2K": "R$ 0,56", "4K": "R$ 0,83" } as Record<string, string>,
    note: "Rápido e barato, ótimo para a maioria das capas.",
  },
  {
    value: "gemini-3.1-flash-lite-image",
    label: "Flash Lite (econômico)",
    sizes: ["1K"] as const,
    price: { "1K": "R$ 0,19" } as Record<string, string>,
    note: "O mais barato e rápido. Só 1K, suficiente para imagens dentro do texto.",
  },
] as const;

const ASPECTS = [
  { value: "16:9", label: "16:9 (capa do artigo)" },
  { value: "4:3", label: "4:3 (imagem no texto)" },
  { value: "1:1", label: "1:1 (quadrada)" },
  { value: "4:5", label: "4:5 (vertical, redes)" },
  { value: "9:16", label: "9:16 (story)" },
] as const;

export function AiImagePanel({
  suggest,
  clientId,
  onGenerated,
}: {
  suggest?: string;
  clientId?: string;
  onGenerated: (media: Media) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState(suggest ? `Imagem de capa para um artigo sobre ${suggest}.` : "");
  const [style, setStyle] = useState<string>(STYLES[0].value);
  const [aspect, setAspect] = useState<string>("16:9");
  const [model, setModel] = useState<string>(MODELS[0].value);
  const [size, setSize] = useState<string>("2K");
  const current = MODELS.find((m) => m.value === model) ?? MODELS[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/imagem")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => alive && setEnabled(Boolean(d.enabled)))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function generate() {
    if (prompt.trim().length < 10) {
      setError("Descreva a imagem com um pouco mais de detalhe.");
      return;
    }
    setBusy(true);
    setElapsed(0);
    setError(null);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/ai/imagem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: `${prompt.trim()} Estilo: ${style}.`, aspect, size, model, clientId }),
        signal: abort.current.signal,
      });
      const data = (await res.json().catch(() => ({}))) as Media & { error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Não foi possível gerar a imagem.");
      onGenerated(data);
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setError(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setBusy(false);
    }
  }

  if (enabled === false) {
    return (
      <p className="text-sm text-muted">
        Geração de imagens desligada. Configure a variável <code className="font-mono text-[13px] text-ink">GEMINI_API_KEY</code> no Easypanel
        para criar imagens sem depender de banco de imagens.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Field
        label="O que deve aparecer na imagem"
        htmlFor="ia-prompt"
        hint="Descreva a cena: ambiente, objetos, luz e clima. Evite pessoas reais, marcas e textos na imagem."
      >
        <Textarea
          id="ia-prompt"
          rows={4}
          maxLength={1200}
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ex.: bancada de marcenaria com ferramentas e um armário planejado ao fundo, luz de fim de tarde"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Estilo" htmlFor="ia-estilo">
          <Select id="ia-estilo" value={style} disabled={busy} onChange={(e) => setStyle(e.target.value)}>
            {STYLES.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Formato" htmlFor="ia-formato">
          <Select id="ia-formato" value={aspect} disabled={busy} onChange={(e) => setAspect(e.target.value)}>
            {ASPECTS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resolução" htmlFor="ia-resolucao">
          <Select id="ia-resolucao" value={size} disabled={busy} onChange={(e) => setSize(e.target.value)}>
            {current.sizes.map((sz) => (
              <option key={sz} value={sz}>
                {sz === "1K" ? "1K (leve)" : sz === "2K" ? "2K (recomendada)" : "4K (máxima)"}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Modelo" htmlFor="ia-modelo" hint={`${current.note} Custo aproximado: ${current.price[size] ?? current.price[current.sizes[0]]} por imagem.`}>
        <Select
          id="ia-modelo"
          value={model}
          disabled={busy}
          onChange={(e) => {
            const next = MODELS.find((m) => m.value === e.target.value) ?? MODELS[0];
            setModel(next.value);
            if (!next.sizes.includes(size as never)) setSize(next.sizes.includes("2K" as never) ? "2K" : next.sizes[0]);
          }}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={generate} loading={busy}>
          <Sparkles className="size-4" aria-hidden />
          {busy ? "Gerando imagem…" : "Gerar imagem"}
        </Button>
        {busy ? (
          <span className="text-[13px] text-muted tabular-nums">
            {elapsed}s. Costuma levar de 20 a 60 segundos.{" "}
            <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => abort.current?.abort()}>
              Cancelar
            </button>
          </span>
        ) : (
          <span className="text-[13px] text-muted">A imagem entra na Mídia e fica pronta para usar.</span>
        )}
      </div>
    </div>
  );
}
