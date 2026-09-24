"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { disconnectGoogle, syncLocations } from "@/lib/data/gbp-actions";

export function GbpConnect({ connected, email, isAdmin }: { connected: boolean; email: string | null; isAdmin: boolean }) {
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
      <a href="/api/google/connect" className={buttonClass("primary")}>
        Conectar conta Google da OutBox
      </a>
    ) : (
      <p className="text-sm text-muted">Peça a um administrador para conectar a conta Google da OutBox.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Conectado{email ? ` como ${email}` : ""}.</span>
      {isAdmin ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => run(syncLocations)} loading={pending}>
            <RefreshCw className="size-3.5" aria-hidden />
            Buscar perfis no Google
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (confirm("Desconectar a conta Google? As publicações e respostas pelo CMS param até conectar de novo.")) run(disconnectGoogle);
            }}
          >
            Desconectar
          </Button>
        </>
      ) : null}
    </div>
  );
}
