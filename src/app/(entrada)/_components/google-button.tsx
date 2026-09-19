"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { signInWithGoogle, type AuthFormState } from "../actions";
import { GoogleG } from "./google-g";
import { FormAlert } from "./form-alert";

/** Botão "Continuar com Google" no padrão claro do Google (fundo branco, borda #747775, G colorido). */
export function GoogleButton({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInWithGoogle, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-[var(--radius-control)] border border-[#747775] bg-white px-4 text-[15px] font-medium text-[#1f1f1f] transition-colors duration-150 hover:bg-[#f7f8f8] active:bg-[#eef0f1] disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? <Loader2 className="size-[18px] animate-spin text-[#5f6368]" aria-hidden /> : <GoogleG className="size-[18px]" />}
        {pending ? "Abrindo o Google..." : "Continuar com Google"}
      </button>
      <FormAlert message={state?.error} className="mt-3" />
    </form>
  );
}
