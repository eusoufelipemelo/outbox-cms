import type { Metadata } from "next";
import { requireClient } from "@/lib/client-auth";
import { listPortalItems } from "@/lib/data/client-area";
import { ClientShell } from "@/components/client-area/shell";

export const metadata: Metadata = {
  title: { default: "Área do cliente", template: "%s · Área do cliente" },
};

export default async function ClientPanelLayout({ children }: LayoutProps<"/cliente">) {
  const { account, company, preview } = await requireClient();
  const items = await listPortalItems(company.id);
  const awaiting = items.filter((i) => i.status === "awaiting").length;
  return (
    <ClientShell company={company} account={account} awaiting={awaiting} preview={preview}>
      {children}
    </ClientShell>
  );
}
