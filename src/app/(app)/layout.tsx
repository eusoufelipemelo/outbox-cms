import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/(entrada)/actions";
import { AppNav } from "@/components/shell/nav";
import { countPendingProfiles } from "@/lib/data/team";
import { db } from "@/lib/supabase/admin";
import { ProfileGate } from "@/components/shell/profile-gate";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [pendingCount, clientsRes] = await Promise.all([
    user.role === "admin" ? countPendingProfiles() : Promise.resolve(0),
    // lista curta para a busca rápida (⌘K) achar clientes de qualquer tela
    db().from("clients").select("id, name, segment, city, state").neq("status", "archived").order("name"),
  ]);
  return (
    <div className="min-h-dvh">
      <AppNav
        user={{ name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, jobTitle: user.jobTitle }}
        pendingCount={pendingCount}
        signOut={signOut}
        clients={(clientsRes.data ?? []) as { id: string; name: string; segment: string | null; city: string | null; state: string | null }[]}
      />
      <ProfileGate complete={user.profileComplete} />
      <main className="lg:pl-[248px] print:pl-0">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
