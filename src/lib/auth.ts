import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; name: string };

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const meta = data.user.user_metadata ?? {};
  const email = data.user.email ?? "";
  return { id: data.user.id, email, name: (meta.name as string) || email.split("@")[0] };
});

/** Garante sessão válida em páginas, server actions e rotas do painel. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
