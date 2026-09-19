import type { ReactNode } from "react";
import { BrandPanel } from "./_components/brand-panel";

// Layout compartilhado de /login, /cadastro, /esqueci-senha, /redefinir-senha e /aguardando-aprovacao.
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,42%)]">
      <BrandPanel />
      <main className="flex flex-col px-4 py-8 sm:px-8 lg:min-h-dvh lg:py-12">
        <div className="mx-auto flex w-full max-w-[424px] flex-1 flex-col justify-center">{children}</div>
      </main>
    </div>
  );
}
