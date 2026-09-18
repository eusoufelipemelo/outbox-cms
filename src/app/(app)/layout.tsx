import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { AppNav } from "@/components/shell/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <AppNav user={{ name: user.name, email: user.email }} signOut={signOut} />
      <main className="lg:pl-[248px]">
        <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
