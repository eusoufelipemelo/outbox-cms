import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/(entrada)/actions";
import { AppNav } from "@/components/shell/nav";
import { countPendingProfiles } from "@/lib/data/team";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const pendingCount = user.role === "admin" ? await countPendingProfiles() : 0;
  return (
    <div className="min-h-dvh">
      <AppNav user={{ name: user.name, email: user.email, role: user.role }} pendingCount={pendingCount} signOut={signOut} />
      <main className="lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
