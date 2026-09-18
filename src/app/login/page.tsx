import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getUser()) redirect("/");
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* lado da marca: o símbolo grande, recortado pela borda */}
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <Image
          src="/brand/simbolo-laranja.svg"
          alt=""
          width={1248}
          height={1248}
          priority
          className="absolute -bottom-[18%] -left-[14%] w-[88%] max-w-none"
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Image src="/brand/simbolo-branco.svg" alt="" width={40} height={40} />
          <p className="display max-w-[14ch] text-right text-[clamp(2.5rem,4.2vw,4rem)] !text-white self-end">
            Um artigo. Todos os sites.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-surface px-6 py-16">
        <div className="w-full max-w-[360px]">
          <Image src="/brand/logo-horizontal.svg" alt="OutBox Soluções Digitais" width={170} height={42} priority />
          <h1 className="mt-10 text-[22px] font-bold text-ink">Entrar no CMS</h1>
          <p className="mt-1 mb-8 text-sm text-muted">Use o e-mail cadastrado pela equipe OutBox.</p>
          <LoginForm next={typeof next === "string" ? next : "/"} />
        </div>
      </div>
    </main>
  );
}
