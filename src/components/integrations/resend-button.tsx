"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendDelivery } from "@/app/(app)/integracoes/actions";

export function ResendButton({ postId, siteId, siteName }: { postId: string; siteId: string; siteName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await resendDelivery(postId, siteId);
      if (result.ok) toast.success(result.message ?? `Artigo reenviado para ${siteName}`);
      else toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" className="h-10" onClick={onClick} loading={pending} aria-label={`Reenviar para ${siteName}`}>
      {pending ? null : <RotateCw className="size-3.5" aria-hidden />}
      Reenviar
    </Button>
  );
}
