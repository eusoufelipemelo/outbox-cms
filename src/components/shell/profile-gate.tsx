"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Perfil incompleto (nome, cargo, WhatsApp e foto são obrigatórios): leva para /perfil antes de usar o CMS. */
export function ProfileGate({ complete }: { complete: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!complete && pathname !== "/perfil") router.replace("/perfil?completar=1");
  }, [complete, pathname, router]);
  return null;
}
