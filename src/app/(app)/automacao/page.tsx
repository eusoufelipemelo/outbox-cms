import type { Metadata } from "next";
import { Bot, Image as ImageIcon, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { automationStatus, listAutomationClients, listRuns } from "@/lib/data/automations";
import { PageHeader } from "@/components/ui/panel";
import { AutomationManager } from "@/components/automation/automation-manager";
import { RunsList } from "@/components/automation/runs-list";
import { TelegramConnect } from "@/components/automation/telegram-connect";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Automação" };

export default async function AutomacaoPage() {
  await requireUser();
  const [clients, runs] = await Promise.all([listAutomationClients(), listRuns()]);
  const status = await automationStatus();
  const active = clients.filter((c) => c.automation?.active).length;
  const perMonth = clients.reduce((n, c) => n + (c.automation?.active ? c.automation.per_month : 0), 0);

  const chips = [
    { on: status.ai, label: status.ai ? "IA de texto ligada" : "Falta ANTHROPIC_API_KEY", icon: Sparkles },
    { on: status.images, label: status.images ? "Imagens ligadas" : "Falta GEMINI_API_KEY", icon: ImageIcon },
    {
      on: status.telegram && status.webhook.connected,
      label: !status.telegram
        ? "Falta TELEGRAM_BOT_TOKEN"
        : status.webhook.connected
          ? `Telegram ligado${status.webhook.bot ? ` (@${status.webhook.bot})` : ""}`
          : "Bot do Telegram ainda não conectado",
      icon: Bot,
    },
  ];

  return (
    <>
      <PageHeader
        title="Automação"
        description={
          active
            ? `${active} cliente(s) com automação ligada, somando ${perMonth} artigo(s) por mês. O CMS escolhe a pauta, escreve, gera a capa e manda para aprovação.`
            : "Ligue a automação de cada cliente: o CMS escolhe a pauta, escreve o artigo com SEO e GEO, gera a imagem de capa e manda o rascunho para o cliente aprovar pelo Telegram."
        }
      />

      <ul className="mb-6 flex flex-wrap gap-2">
        {chips.map((c) => (
          <li
            key={c.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 py-1 text-[13px]",
              c.on ? "border-ok/40 bg-ok-soft text-ok" : "border-warn/40 bg-warn-soft text-warn",
            )}
          >
            <c.icon className="size-3.5" aria-hidden />
            {c.label}
          </li>
        ))}
      </ul>

      {status.telegram && !status.webhook.connected ? <TelegramConnect /> : null}
      {status.webhook.error ? (
        <p className="mb-6 rounded-[var(--radius-control)] bg-warn-soft px-4 py-3 text-sm text-warn">Último erro do Telegram: {status.webhook.error}</p>
      ) : null}

      <AutomationManager clients={clients} telegramReady={status.telegram} />

      <section className="mt-10">
        <h2 className="mb-3 text-[17px] font-semibold text-ink">Últimas execuções</h2>
        <RunsList runs={runs} appUrl={env.appUrl} />
      </section>
    </>
  );
}
