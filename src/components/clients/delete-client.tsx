"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { deleteClient } from "@/lib/data/client-actions";
import { ConfirmDialog } from "./confirm-dialog";

export function DeleteClientPanel({ clientId, clientName, siteCount }: { clientId: string; clientName: string; siteCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteClient(clientId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Cliente excluído");
      setOpen(false);
      router.replace("/clientes");
    });
  }

  const sites = siteCount === 1 ? "o site dele" : siteCount > 1 ? `os ${siteCount} sites dele` : null;

  return (
    <Panel title="Excluir cliente" description="Remove o cadastro de forma permanente.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch] text-sm text-muted">
          {sites ? `Também remove ${sites} e o histórico de publicações neles. ` : ""}
          Os artigos continuam no CMS.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)} className="justify-center">
          <Trash2 className="size-4" aria-hidden />
          Excluir cliente
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        pending={pending}
        destructive
        title={`Excluir ${clientName}?`}
        confirmLabel="Excluir cliente"
      >
        <p>Esta ação não pode ser desfeita.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            {sites
              ? `Remove ${sites}, com as chaves de integração e os registros de publicação e de entrega.`
              : "Remove o cadastro do cliente."}
          </li>
          <li>Os artigos continuam no CMS e podem ser publicados em outros sites.</li>
          {siteCount > 0 ? (
            <li>Os sites deixam de receber artigos pela Content API na hora. Posts já criados em WordPress não são apagados lá.</li>
          ) : null}
        </ul>
      </ConfirmDialog>
    </Panel>
  );
}
