"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { linkLiPage, publishToLinkedIn } from "@/lib/data/linkedin-actions";
import type { LiPageRow } from "@/lib/data/linkedin";

type ClientOpt = { id: string; name: string };
type PostOpt = { id: string; title: string; client_id: string };

export function LiPageCard({ page, clients, posts }: { page: LiPageRow; clients: ClientOpt[]; posts: PostOpt[] }) {
  const [pending, start] = useTransition();
  const [postId, setPostId] = useState("");
  const router = useRouter();
  const clientPosts = posts.filter((p) => p.client_id === page.client_id);

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  return (
    <li className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-3 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{page.name}</p>
          <p className="text-[13px] text-muted">{page.website ?? "Sem site na página"}</p>
          {page.vanity_name ? (
            <a
              href={`https://www.linkedin.com/company/${page.vanity_name}/`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"
            >
              Ver na LinkedIn
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
        <div className="w-full sm:w-72">
          <label className="sr-only" htmlFor={`li-cli-${page.id}`}>
            Cliente desta página
          </label>
          <Select
            id={`li-cli-${page.id}`}
            value={page.client_id ?? ""}
            onChange={(e) => act(() => linkLiPage(page.id, e.target.value || null))}
            disabled={pending}
          >
            <option value="">Sem cliente ligado</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {page.client_id ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
          <label className="sr-only" htmlFor={`li-post-${page.id}`}>
            Artigo para publicar
          </label>
          <Select id={`li-post-${page.id}`} value={postId} onChange={(e) => setPostId(e.target.value)} className="min-w-0 flex-1 sm:max-w-md">
            <option value="">{clientPosts.length ? "Escolha um artigo no ar" : "Este cliente ainda não tem artigo no ar"}</option>
            {clientPosts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={!postId} loading={pending} onClick={() => act(() => publishToLinkedIn(page.id, postId))}>
            <Send className="size-3.5" aria-hidden />
            Publicar na LinkedIn
          </Button>
        </div>
      ) : null}
    </li>
  );
}
