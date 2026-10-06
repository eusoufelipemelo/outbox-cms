"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { disconnectLinkedIn, syncLiPages } from "@/lib/data/linkedin-actions";

export function LiConnect({ connected, name, isAdmin }: { connected: boolean; name: string | null; isAdmin: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message ?? "Pronto");
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });

  if (!connected) {
    return isAdmin ? (
      <a href="/api/linkedin/connect" className={buttonClass("primary")}>
        Conectar LinkedIn
      </a>
    ) : (
      <p className="text-sm text-muted">Peça a um administrador para conectar a conta da LinkedIn.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Conectado{name ? ` como ${name}` : ""}.</span>
      {isAdmin ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => run(syncLiPages)} loading={pending}>
            <RefreshCw className="size-3.5" aria-hidden />
            Buscar páginas
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (confirm("Desconectar a LinkedIn? As publicações pelo CMS param até conectar de novo.")) run(disconnectLinkedIn);
            }}
          >
            Desconectar
          </Button>
        </>
      ) : null}
    </div>
  );
}
