import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { GROUPS, settingsForPanel } from "@/lib/settings";
import { PageHeader } from "@/components/ui/panel";
import { SettingsForm } from "@/components/admin/settings-form";

export const metadata: Metadata = { title: "Painel administrativo" };

export default async function PainelPage() {
  await requireAdmin();
  const current = await settingsForPanel();

  return (
    <>
      <PageHeader
        title="Painel administrativo"
        description="Chaves de API e modelos de cada função do CMS, guardados no próprio sistema. Os segredos ficam cifrados no banco e só aparecem aqui pelos últimos caracteres."
      />
      <SettingsForm groups={GROUPS} current={current} />
      <p className="mt-6 max-w-[70ch] text-[13px] text-muted">
        As chaves que estavam nas variáveis do Easypanel foram trazidas para cá automaticamente. Depois de conferir que tudo funciona, você pode
        removê-las de lá. As variáveis do Supabase e a URL do app continuam no servidor, porque são o que liga o CMS ao banco.
      </p>
    </>
  );
}
