import Image from "next/image";
import type { ReactNode } from "react";

/** Moldura da área do cliente: marca da OutBox discreta no topo e a coluna de leitura. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[760px] items-center justify-between px-4 sm:px-6">
          <span className="inline-flex items-end gap-2">
            <Image src="/brand/logo-horizontal.svg" alt="OutBox" width={96} height={24} className="dark:hidden" />
            <Image src="/brand/logo-horizontal-branco.svg" alt="OutBox" width={96} height={24} className="hidden dark:block" />
          </span>
          <span className="text-[13px] text-muted">Área do cliente</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[760px] px-4 pt-8 pb-32 sm:px-6">{children}</main>
    </div>
  );
}
