"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectTelegramBot } from "@/lib/data/automation-actions";

/** Registra o webhook do bot no Telegram, sem ninguém precisar montar URL com o token. */
export function TelegramConnect() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface p-4">
      <Bot className="size-5 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 text-[14px] text-text">
        O bot está configurado no servidor, mas ainda não recebe as respostas dos clientes. Conecte para ativar os botões de aprovar e pedir ajustes.
      </p>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await connectTelegramBot();
            if (r.ok) {
              toast.success(r.message ?? "Bot conectado");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      >
        Conectar bot
      </Button>
    </div>
  );
}
