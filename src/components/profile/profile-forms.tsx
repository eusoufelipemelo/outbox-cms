"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changeEmail, changePassword, saveProfile } from "@/lib/data/profile-actions";
import { prepareImage } from "@/components/media/upload";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import type { ActionResult } from "@/lib/types";

type State = ActionResult | null;

function useResultToast(state: State, onOk?: () => void) {
  const last = useRef<State>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Salvo");
      onOk?.();
    } else if (!state.fieldErrors) toast.error(state.error);
  }, [state, onOk]);
}

const err = (s: State, k: string) => (s && !s.ok ? s.fieldErrors?.[k] : undefined);

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

export function ProfileForm({
  initial,
}: {
  initial: { name: string; jobTitle: string; phone: string; bio: string; avatarUrl: string | null };
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<State, FormData>(saveProfile, null);
  const [avatar, setAvatar] = useState(initial.avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [phone, setPhone] = useState(formatPhone(initial.phone));
  const fileRef = useRef<HTMLInputElement>(null);
  useResultToast(state, () => router.refresh());

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const ready = await prepareImage(file);
      const body = new FormData();
      body.append("file", ready);
      const res = await fetch("/api/avatar", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Não foi possível enviar a foto.");
      setAvatar(data.url);
      toast.success("Foto atualizada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Panel title="Dados pessoais" description="Nome, cargo, WhatsApp e foto são obrigatórios para usar o CMS.">
      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto do perfil
            <img src={avatar} alt="Sua foto" className="size-20 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full border-2 border-dashed border-danger bg-danger-soft text-danger">
              <Camera className="size-6" aria-hidden />
            </div>
          )}
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <Loader2 className="size-5 animate-spin text-white" aria-hidden />
            </div>
          ) : null}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="avatar" onChange={(e) => onPhoto(e.target.files?.[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={uploading}>
            <Camera className="size-4" aria-hidden />
            {avatar ? "Trocar foto" : "Enviar foto"}
          </Button>
          <p className="mt-1.5 text-[12.5px] text-muted">{avatar ? "JPG, PNG ou WebP. Fotos grandes são reduzidas automaticamente." : "Obrigatória: uma foto de rosto, de frente."}</p>
        </div>
      </div>

      <form action={action} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome completo" htmlFor="name" error={err(state, "name")}>
            <Input id="name" name="name" required defaultValue={initial.name} autoComplete="name" aria-invalid={Boolean(err(state, "name"))} />
          </Field>
          <Field label="Cargo ou função" htmlFor="job_title" error={err(state, "job_title")} hint="Ex.: Redatora, Designer, Gestor de conteúdo.">
            <Input id="job_title" name="job_title" required defaultValue={initial.jobTitle} aria-invalid={Boolean(err(state, "job_title"))} />
          </Field>
          <Field label="WhatsApp" htmlFor="phone" error={err(state, "phone")}>
            <Input
              id="phone"
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="(47) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              aria-invalid={Boolean(err(state, "phone"))}
            />
          </Field>
        </div>
        <Field label="Sobre você (opcional)" htmlFor="bio" error={err(state, "bio")} hint="Uma ou duas frases. Pode aparecer como autor nos artigos.">
          <Textarea id="bio" name="bio" rows={3} maxLength={400} defaultValue={initial.bio} />
        </Field>
        <Button type="submit" loading={pending}>
          Salvar perfil
        </Button>
      </form>
    </Panel>
  );
}

export function EmailForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<State, FormData>(changeEmail, null);
  useResultToast(state);
  return (
    <Panel title="E-mail de acesso" description={`Hoje você entra com ${current}.`}>
      <form action={action} className="space-y-4">
        <Field label="Novo e-mail" htmlFor="email" error={err(state, "email")} hint="Enviamos um link de confirmação. O e-mail só muda depois do clique.">
          <Input id="email" name="email" type="email" required autoComplete="email" aria-invalid={Boolean(err(state, "email"))} />
        </Field>
        {state?.ok ? <p className="rounded-[var(--radius-control)] bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p> : null}
        <Button type="submit" variant="secondary" loading={pending}>
          Trocar e-mail
        </Button>
      </form>
    </Panel>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(state, () => formRef.current?.reset());
  return (
    <Panel
      title={hasPassword ? "Senha" : "Criar senha"}
      description={hasPassword ? "Para trocar, confirme a senha atual." : "Você entra com Google. Crie uma senha para também entrar com e-mail."}
    >
      <form ref={formRef} action={action} className="space-y-4">
        {hasPassword ? (
          <Field label="Senha atual" htmlFor="current" error={err(state, "current")}>
            <Input id="current" name="current" type="password" required autoComplete="current-password" aria-invalid={Boolean(err(state, "current"))} />
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova senha" htmlFor="password" error={err(state, "password")} hint="Pelo menos 8 caracteres.">
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" aria-invalid={Boolean(err(state, "password"))} />
          </Field>
          <Field label="Repita a nova senha" htmlFor="confirm" error={err(state, "confirm")}>
            <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" aria-invalid={Boolean(err(state, "confirm"))} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          {hasPassword ? "Trocar senha" : "Criar senha"}
        </Button>
      </form>
    </Panel>
  );
}
