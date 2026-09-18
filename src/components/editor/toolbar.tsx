"use client";

import { useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { Tip } from "./primitives";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const tip = shortcut ? `${label} (${shortcut.replace("Mod", isMac() ? "Cmd" : "Ctrl")})` : label;
  return (
    <Tip label={tip} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          "inline-flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[18px]",
          active ? "bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-muted hover:bg-sunken hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />;
}

function normalizeHref(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

export function EditorToolbar({
  editor,
  onRequestImage,
  trailing,
  compact,
  className,
}: {
  editor: Editor;
  onRequestImage?: () => void;
  trailing?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      link: e.isActive("link"),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      image: e.isActive("image"),
      imageAlt: e.isActive("image") ? ((e.getAttributes("image").alt as string | undefined) ?? "") : "",
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");

  const openLink = () => {
    setHref(s.href);
    setLinkOpen(true);
  };
  const applyLink = () => {
    const url = normalizeHref(href);
    const chain = editor.chain().focus();
    if (!url) chain.extendMarkRange("link").unsetLink().run();
    else if (editor.state.selection.empty && !editor.isActive("link"))
      chain.insertContent({ type: "text", text: href.trim(), marks: [{ type: "link", attrs: { href: url } }] }).run();
    else chain.extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  };
  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <div className={cn("border-b border-line", className)}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <div role="toolbar" aria-label="Formatação do texto" className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
          <ToolButton label="Subtítulo H2" active={s.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 aria-hidden />
          </ToolButton>
          <ToolButton label="Subtítulo H3" active={s.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 aria-hidden />
          </ToolButton>
          <Sep />
          <ToolButton label="Negrito" shortcut="Mod+B" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold aria-hidden />
          </ToolButton>
          <ToolButton label="Itálico" shortcut="Mod+I" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic aria-hidden />
          </ToolButton>
          <ToolButton label={s.link ? "Editar link" : "Inserir link"} active={s.link || linkOpen} onClick={openLink}>
            <Link2 aria-hidden />
          </ToolButton>
          <Sep />
          <ToolButton label="Lista com marcadores" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List aria-hidden />
          </ToolButton>
          <ToolButton label="Lista numerada" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered aria-hidden />
          </ToolButton>
          <ToolButton label="Citação" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote aria-hidden />
          </ToolButton>
          {!compact ? (
            <>
              <Sep />
              {onRequestImage ? (
                <ToolButton label="Inserir imagem" onClick={onRequestImage}>
                  <ImagePlus aria-hidden />
                </ToolButton>
              ) : null}
              <ToolButton label="Linha divisória" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                <Minus aria-hidden />
              </ToolButton>
            </>
          ) : null}
          <Sep />
          <ToolButton label="Desfazer" shortcut="Mod+Z" disabled={!s.canUndo} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 aria-hidden />
          </ToolButton>
          <ToolButton label="Refazer" shortcut="Mod+Shift+Z" disabled={!s.canRedo} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 aria-hidden />
          </ToolButton>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>

      {linkOpen ? (
        <form
          className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <label htmlFor="toolbar-link" className="text-sm font-medium text-ink">
            Endereço do link
          </label>
          <Input
            id="toolbar-link"
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkOpen(false);
                editor.commands.focus();
              }
            }}
            placeholder="https://"
            inputMode="url"
            className="h-10 min-w-0 flex-1 basis-48"
          />
          <Button type="submit" size="md">
            Aplicar link
          </Button>
          {s.link ? (
            <Button variant="ghost" onClick={removeLink}>
              Remover link
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setLinkOpen(false)}>
            Cancelar
          </Button>
        </form>
      ) : null}

      {s.image && !compact ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
          <label htmlFor="toolbar-alt" className="text-sm font-medium text-ink">
            Texto alternativo da imagem
          </label>
          <Input
            id="toolbar-alt"
            value={s.imageAlt}
            onChange={(e) => editor.commands.updateAttributes("image", { alt: e.target.value })}
            placeholder="Descreva o que a imagem mostra"
            className="h-10 min-w-0 flex-1 basis-48"
            aria-invalid={s.imageAlt.trim() === "" || undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
