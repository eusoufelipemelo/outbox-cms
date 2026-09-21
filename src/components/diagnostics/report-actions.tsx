"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Printer, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDiagnostic, rerunDiagnostic } from "@/lib/data/diagnostic-actions";
import { Button } from "@/components/ui/button";

export function ReportActions({ id, shareUrl, done }: { id: string; shareUrl: string; done: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link do relatório copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };

  const rerun = () =>
    start(async () => {
      const r = await rerunDiagnostic(id);
      if (r.ok) {
        toast.success("Diagnóstico reiniciado");
        router.refresh();
      } else toast.error(r.error);
    });

  const remove = () => {
    if (!confirm("Excluir este diagnóstico? O link enviado ao cliente deixa de funcionar.")) return;
    start(async () => {
      const r = await deleteDiagnostic(id);
      if (r.ok) {
        toast.success("Diagnóstico excluído");
        router.push("/diagnosticos");
      } else toast.error(r.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {done ? (
        <>
          <Button onClick={copy}>
            <Link2 className="size-4" aria-hidden />
            Copiar link para o cliente
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Salvar em PDF
          </Button>
        </>
      ) : null}
      <Button variant="secondary" onClick={rerun} loading={pending}>
        <RotateCcw className="size-4" aria-hidden />
        Refazer
      </Button>
      <Button variant="ghost" size="icon" onClick={remove} aria-label="Excluir diagnóstico" disabled={pending}>
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      Salvar em PDF
    </Button>
  );
}
