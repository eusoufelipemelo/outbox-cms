"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Panel } from "@/components/ui/panel";
import { deleteSite, regenerateSiteKey, runSiteConnectionTest } from "@/lib/data/site-actions";
import { formatDateTime } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { connectionTone } from "./options";

/** Resultado do último teste de conexão e botão "Testar conexão". */
export function SiteConnectionPanel({
  siteId,
  lastCheckAt,
  lastCheckOk,
  lastCheckMessage,
}: {
  siteId: string;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const tone = connectionTone(lastCheckOk);
  const label = lastCheckOk === true ? "Funcionando" : lastCheckOk === false ? "Com falha" : "Ainda não testada";

  function test() {
    startTransition(async () => {
      const result = await runSiteConnectionTest(siteId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data?.ok) toast.success("Conexão funcionando", { description: result.data.message });
      else toast.error("A conexão falhou", { description: result.data?.message });
    });
  }

  return (
    <Panel title="Conexão" description="Confere se o CMS consegue entregar artigos neste site.">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>
              <StatusDot tone={tone} />
              {label}
            </Badge>
            {lastCheckAt ? <span className="text-[13px] text-muted">Último teste em {formatDateTime(lastCheckAt)}</span> : null}
          </div>
          {lastCheckMessage ? <p className="text-sm break-words text-text">{lastCheckMessage}</p> : null}
          {lastCheckOk === null ? (
            <p className="text-sm text-muted">Teste depois de configurar o canal de entrega para saber se está tudo certo.</p>
          ) : null}
        </div>
        <Button variant="secondary" onClick={test} loading={pending} className="w-full justify-center">
          {pending ? null : <PlugZap className="size-4" aria-hidden />}
          {pending ? "Testando conexão" : "Testar conexão"}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Chave pública (com troca), segredo do webhook e chave do IndexNow, para o desenvolvedor do site.
 * `indexnowKey`/`siteUrl` são opcionais: sem eles o bloco do IndexNow não aparece.
 */
export function SiteKeysPanel({
  siteId,
  publicKey,
  webhookSecret,
  indexnowKey,
  siteUrl,
}: {
  siteId: string;
  publicKey: string;
  webhookSecret: string;
  indexnowKey?: string | null;
  siteUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateSiteKey(siteId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Nova chave gerada", { description: "Atualize a chave no código de integração do site." });
      setOpen(false);
    });
  }

  return (
    <Panel title="Chaves de integração" description="Entregue ao desenvolvedor do site junto com o código de integração.">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Chave pública</p>
          <CopyField value={publicKey} label="Copiar chave pública" />
          <p className="text-[13px] text-muted">Usada pela Content API e pelo script de embed. Pode ficar no código do site.</p>
          <Button variant="ghost" onClick={() => setOpen(true)} className="-ml-2">
            <RefreshCw className="size-4" aria-hidden />
            Gerar nova chave
          </Button>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink">Segredo do webhook</p>
          <CopyField value={webhookSecret} label="Copiar segredo do webhook" />
          <p className="text-[13px] text-muted">Assina cada aviso enviado ao site. Guarde no servidor do site, nunca no navegador.</p>
        </div>
        {indexnowKey ? (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-ink">Chave do IndexNow</p>
            <CopyField value={indexnowKey} label="Copiar chave do IndexNow" />
            <p className="text-[13px] text-muted">
              A cada publicação avisamos o Bing e os buscadores que alimentam as IAs. O site precisa responder esta chave em{" "}
              <span className="font-mono text-[12px] break-all text-text">
                {siteUrl ? `${siteUrl.replace(/\/+$/, "")}/${indexnowKey}.txt` : `/${indexnowKey}.txt`}
              </span>
              ; o site OutBox já faz isso.
            </p>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={regenerate}
        pending={pending}
        title="Gerar nova chave pública?"
        confirmLabel="Gerar nova chave"
      >
        <p>A chave atual para de funcionar na hora.</p>
        <p>O site deixa de mostrar os artigos até que a nova chave seja colocada no código de integração.</p>
      </ConfirmDialog>
    </Panel>
  );
}

export function DeleteSitePanel({ siteId, siteName, clientId }: { siteId: string; siteName: string; clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteSite(siteId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Site excluído");
      setOpen(false);
      router.replace(`/clientes/${clientId}`);
    });
  }

  return (
    <Panel title="Excluir site" description="Remove este destino de forma permanente.">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[60ch] text-sm text-muted">
          Também remove o histórico de publicações e entregas deste site. Os artigos continuam no CMS.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)} className="justify-center">
          <Trash2 className="size-4" aria-hidden />
          Excluir site
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={confirm}
        pending={pending}
        destructive
        title={`Excluir ${siteName}?`}
        confirmLabel="Excluir site"
      >
        <p>Esta ação não pode ser desfeita.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Remove o site, as chaves de integração e os registros de publicação e de entrega dele.</li>
          <li>Os artigos continuam no CMS e nos outros sites onde foram publicados.</li>
          <li>O site para de receber artigos pela Content API na hora. Posts já criados em WordPress não são apagados lá.</li>
        </ul>
      </ConfirmDialog>
    </Panel>
  );
}
