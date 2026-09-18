"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { FileText, ListTree, SearchCheck, Sparkles, Type, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { callAi } from "@/lib/ai/client";
import type { AiAction, AiOutput } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { Dialog, Menu, useConfirm, type MenuItem } from "./primitives";

const DISABLED_HINT = "Configure ANTHROPIC_API_KEY para ativar";

const actionLabel: Record<Exclude<AiAction, "variation">, string> = {
  titles: "Sugerindo títulos",
  outline: "Gerando estrutura",
  draft: "Escrevendo rascunho",
  improve: "Melhorando trecho",
  seo: "Preenchendo SEO",
};

const suggestions = ["Deixar mais claro", "Encurtar", "Tom mais próximo do leitor", "Corrigir gramática e pontuação"];

function selectionHtml(editor: Editor): { from: number; to: number; html: string } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const slice = editor.state.doc.slice(from, to);
  const fragment = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
  const div = document.createElement("div");
  div.appendChild(fragment);
  return { from, to, html: div.innerHTML };
}

export function AiAssistant({
  editor,
  enabled,
  title,
  focusKeyword,
  clientId,
  onApplyTitle,
  onApplySeo,
}: {
  editor: Editor;
  enabled: boolean | null;
  title: string;
  focusKeyword: string;
  clientId?: string;
  onApplyTitle: (title: string) => void;
  onApplySeo: (seo: AiOutput["seo"]) => void;
}) {
  const [running, setRunning] = useState<Exclude<AiAction, "variation"> | null>(null);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [improve, setImprove] = useState<{ from: number; to: number; html: string } | null>(null);
  const [instruction, setInstruction] = useState("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const keyword = focusKeyword.trim() || undefined;

  async function run<T>(action: Exclude<AiAction, "variation">, fn: () => Promise<T>): Promise<T | null> {
    setRunning(action);
    try {
      return await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O assistente não respondeu. Tente de novo.");
      return null;
    } finally {
      setRunning(null);
    }
  }

  const needTitle = (what: string) => {
    if (title.trim()) return false;
    toast.error(`Escreva um título primeiro para ${what}.`);
    return true;
  };

  async function suggestTitles() {
    const topic = title.trim() || editor.getText().slice(0, 400).trim();
    if (!topic) {
      toast.error("Escreva um tema no título ou algumas linhas no texto para receber sugestões.");
      return;
    }
    const out = await run("titles", () => callAi("titles", { topic, keyword, clientId }));
    if (out?.titles.length) setTitles(out.titles);
    else if (out) toast.error("O assistente não sugeriu títulos desta vez. Tente de novo.");
  }

  async function outline() {
    if (needTitle("gerar a estrutura")) return;
    const out = await run("outline", () => callAi("outline", { title, keyword, clientId }));
    if (!out) return;
    if (editor.isEmpty) editor.commands.setContent(out.html);
    else editor.chain().focus("end").insertContent(out.html).run();
    toast.success("Estrutura inserida no texto");
  }

  async function draft() {
    if (needTitle("escrever o rascunho")) return;
    const hasText = !editor.isEmpty;
    if (
      hasText &&
      !(await confirm({
        title: "Substituir o texto atual?",
        description: "O rascunho usa o que já está escrito como roteiro e substitui o texto. Você pode desfazer com Ctrl+Z.",
        confirmLabel: "Escrever rascunho",
      }))
    )
      return;
    const outlineHtml = hasText ? editor.getHTML() : undefined;
    const out = await run("draft", () => callAi("draft", { title, outlineHtml, keyword, clientId, words: 900 }));
    if (!out) return;
    editor.commands.setContent(out.html);
    toast.success("Rascunho escrito. Revise antes de publicar.");
  }

  function openImprove() {
    const sel = selectionHtml(editor);
    if (!sel) {
      toast.error("Selecione um trecho do texto para melhorar.");
      return;
    }
    setImprove(sel);
  }

  async function submitImprove() {
    if (!improve || !instruction.trim()) return;
    const target = improve;
    const out = await run("improve", () => callAi("improve", { html: target.html, instruction: instruction.trim() }));
    if (!out) return;
    editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, out.html).run();
    setImprove(null);
    setInstruction("");
    toast.success("Trecho reescrito. Use Ctrl+Z para voltar.");
  }

  async function fillSeo() {
    if (needTitle("preencher o SEO")) return;
    if (editor.isEmpty) {
      toast.error("Escreva o texto antes de preencher o SEO.");
      return;
    }
    const out = await run("seo", () => callAi("seo", { title, html: editor.getHTML(), keyword }));
    if (!out) return;
    onApplySeo(out);
    toast.success("SEO preenchido. Revise os campos na seção SEO.");
  }

  const off = enabled !== true || running !== null;
  const hint = enabled === false ? DISABLED_HINT : enabled === null ? "Verificando o assistente" : undefined;
  const items: MenuItem[] = [
    { key: "titles", label: "Sugerir títulos", icon: <Type aria-hidden />, onSelect: suggestTitles },
    { key: "outline", label: "Gerar estrutura", icon: <ListTree aria-hidden />, onSelect: outline },
    { key: "draft", label: "Escrever rascunho", icon: <FileText aria-hidden />, onSelect: draft },
    { key: "improve", label: "Melhorar trecho selecionado", icon: <WandSparkles aria-hidden />, onSelect: openImprove },
    { key: "seo", label: "Preencher SEO", icon: <SearchCheck aria-hidden />, onSelect: fillSeo },
  ].map((item) => ({ ...item, disabled: off, hint }));

  return (
    <>
      <Menu
        label="Assistente de escrita"
        items={items}
        header={
          enabled === false ? (
            <p className="px-3 pt-2 pb-2 text-[12.5px] text-muted">O assistente de escrita está desligado neste ambiente.</p>
          ) : null
        }
        trigger={(props) => (
          <Button variant="secondary" {...props} loading={running !== null} aria-label={running ? `${actionLabel[running]}…` : "Assistente"}>
            {running ? null : <Sparkles className="size-4" aria-hidden />}
            <span className={cn(running ? "" : "hidden sm:inline")}>{running ? `${actionLabel[running]}…` : "Assistente"}</span>
          </Button>
        )}
      />

      <Dialog
        open={titles !== null}
        onClose={() => setTitles(null)}
        title="Sugestões de título"
        description="Escolha uma para substituir o título atual."
      >
        <ul className="space-y-2">
          {(titles ?? []).map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => {
                  onApplyTitle(t);
                  setTitles(null);
                  toast.success("Título aplicado");
                }}
                className="w-full cursor-pointer rounded-[var(--radius-control)] border border-line px-3 py-2.5 text-left text-[15px] font-medium text-ink transition-colors hover:border-ink"
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={improve !== null}
        onClose={() => {
          if (running) return;
          setImprove(null);
        }}
        dismissible={running === null}
        title="Melhorar trecho selecionado"
        description="Diga o que mudar. O trecho reescrito substitui a seleção."
        footer={
          <>
            <Button variant="secondary" onClick={() => setImprove(null)} disabled={running !== null}>
              Cancelar
            </Button>
            <Button onClick={submitImprove} loading={running === "improve"} disabled={!instruction.trim()}>
              Reescrever trecho
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitImprove();
          }}
          className="space-y-3"
        >
          <Label htmlFor="ai-instruction">Instrução</Label>
          <Textarea
            id="ai-instruction"
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ex.: deixar mais direto e citar a cidade do cliente"
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInstruction(s)}
                className="inline-flex h-10 cursor-pointer items-center rounded-[var(--radius-chip)] border border-line bg-sunken px-3 text-[13px] text-ink hover:border-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </form>
      </Dialog>

      {confirmDialog}
    </>
  );
}
