"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { prepareImage } from "@/components/media/upload";
import { ClientAvatar } from "./avatar";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/app/(entrada)/_components/password-input";
import { changeClientPassword, saveClientAccount, type ClientFormState } from "@/lib/data/client-area-actions";

function Saved({ state }: { state: ClientFormState }) {
  if (state?.ok) return <p role="status" className="text-[14px] font-medium text-ok">{state.ok}</p>;
  if (state?.error) return <p role="alert" className="text-[14px] text-danger">{state.error}</p>;
  return null;
}

export function AccountForm({ name, phone, email, company }: { name: string; phone: string; email: string; company: string }) {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(saveClientAccount, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <Field label="Seu nome" htmlFor="name" error={e.name}>
        <Input id="name" name="name" defaultValue={state?.values?.name ?? name} autoComplete="name" className="h-11" />
      </Field>
      <Field label="WhatsApp" htmlFor="phone" error={e.phone} hint="A OutBox usa para avisar quando tiver artigo novo.">
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={state?.values?.phone ?? phone} autoComplete="tel" className="h-11" />
      </Field>
      <Field label="E-mail de acesso" htmlFor="email" hint="Para trocar o e-mail, fale com a OutBox.">
        <Input id="email" value={email} readOnly disabled className="h-11" />
      </Field>
      <Field label="Empresa" htmlFor="company">
        <Input id="company" value={company} readOnly disabled className="h-11" />
      </Field>
      <Saved state={state} />
      <Button type="submit" loading={pending}>
        Salvar dados
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ClientFormState, FormData>(changeClientPassword, undefined);
  const e = state?.fieldErrors ?? {};
  return (
    <form action={action} noValidate className="space-y-4">
      <Field label="Senha atual" htmlFor="current" error={e.current}>
        <PasswordInput id="current" name="current" autoComplete="current-password" />
      </Field>
      <Field label="Nova senha" htmlFor="password" error={e.password} hint="Pelo menos 8 caracteres.">
        <PasswordInput id="password" name="password" autoComplete="new-password" />
      </Field>
      <Field label="Repita a nova senha" htmlFor="confirm" error={e.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" />
      </Field>
      <Saved state={state} />
      <Button type="submit" variant="secondary" loading={pending}>
        Trocar senha
      </Button>
    </form>
  );
}

/** Foto de perfil: o cliente envia, troca ou tira. Fotos grandes são reduzidas antes do envio. */
export function AvatarForm({ url, name }: { url: string | null; name: string }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState(url);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", await prepareImage(file));
      const res = await fetch("/api/cliente/avatar", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Não foi possível enviar a foto.");
      setAvatar(data.url);
      toast.success("Foto atualizada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy("remove");
    try {
      const res = await fetch("/api/cliente/avatar", { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Não foi possível tirar a foto.");
      setAvatar(null);
      toast.success("Foto removida");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível tirar a foto.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative">
        <ClientAvatar url={avatar} size={88} />
        {busy === "upload" ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
            <Loader2 className="size-6 animate-spin text-white" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold text-ink">{name}</p>
        <p className="mt-0.5 text-[13.5px] text-muted">JPG, PNG ou WebP. Fotos grandes são reduzidas automaticamente.</p>
        <input
          ref={fileRef}
          id="foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => send(e.target.files?.[0])}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy === "upload"} disabled={busy !== null}>
            <Camera className="size-4" aria-hidden />
            {avatar ? "Trocar foto" : "Enviar foto"}
          </Button>
          {avatar ? (
            <Button variant="ghost" onClick={remove} loading={busy === "remove"} disabled={busy !== null}>
              <Trash2 className="size-4" aria-hidden />
              Tirar foto
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
