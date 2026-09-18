import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { Extensions } from "@tiptap/react";

/**
 * Extensões do editor de artigo. StarterKit v3 já inclui Link, Underline e UndoRedo —
 * configuramos por ele em vez de registrar de novo.
 */
export function articleExtensions(placeholder: string): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto", "tel"],
        // sem nofollow/target automáticos: links internos precisam passar autoridade
        HTMLAttributes: { target: null, rel: null, class: null },
      },
    }),
    Image.configure({ inline: false, allowBase64: false }),
    Placeholder.configure({ placeholder }),
  ];
}
