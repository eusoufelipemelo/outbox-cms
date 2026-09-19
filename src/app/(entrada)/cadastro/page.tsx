import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { EntryFootnote } from "../_components/entry-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage({ searchParams }: PageProps<"/cadastro">) {
  const { next } = await searchParams;
  const user = await getUser().catch(() => null);
  if (user?.status === "active") redirect("/");
  if (user?.status === "pending") redirect("/aguardando-aprovacao");
  const nextPath = safeNext(typeof next === "string" ? next : "/");

  return (
    <>
      <SignupForm next={nextPath} />
      <EntryFootnote />
    </>
  );
}

