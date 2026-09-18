"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { MediaPicker } from "@/components/media/media-picker";
import { saveClient } from "@/lib/data/client-actions";
import type { ActionResult, Client } from "@/lib/types";
import { CLIENT_STATUS, CLIENT_STATUSES, UFS } from "./options";
import { KeywordInput } from "./keyword-input";

type State = ActionResult<{ id: string }> | null;

export function ClientForm({ client }: { client?: Client }) {
  const router = useRouter();
  const isNew = !client;
  const [logoUrl, setLogoUrl] = useState(client?.logo_url ?? "");
  const [color, setColor] = useState(client?.brand_color ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [state, formAction, pending] = useActionState<State, FormData>(async (prev, formData) => {
    const result = await saveClient(prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Cliente salvo");
      if (isNew && result.data) router.replace(`/clientes/${result.data.id}`);
    } else {
      toast.error(result.error);
    }
    return result;
  }, null);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errors[k];
  const invalid = (k: string) => (errors[k] ? true : undefined);

  // Envia sem o reset automático do <form action>, para não apagar o que foi digitado quando há erro.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  const validColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "#000000";

  return (
    <>
      <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-6">
        {client ? <input type="hidden" name="id" value={client.id} /> : null}

        <Panel title="Dados do cliente" description="Como o cliente aparece no CMS e na escolha de destinos.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Nome do cliente"
              htmlFor="name"
              error={err("name")}
              hint="Nome fantasia, como a marca é conhecida."
              className="sm:col-span-2"
            >
              <Input
                id="name"
                name="name"
                defaultValue={client?.name ?? ""}
                required
                maxLength={120}
                aria-invalid={invalid("name")}
                autoFocus={isNew}
              />
            </Field>
            <Field label="Razão social" htmlFor="legal_name" error={err("legal_name")}>
              <Input id="legal_name" name="legal_name" defaultValue={client?.legal_name ?? ""} aria-invalid={invalid("legal_name")} />
            </Field>
            <Field label="CNPJ ou CPF" htmlFor="document" error={err("document")}>
              <Input
                id="document"
                name="document"
                defaultValue={client?.document ?? ""}
                inputMode="numeric"
                aria-invalid={invalid("document")}
              />
            </Field>
            <Field label="Segmento" htmlFor="segment" error={err("segment")} hint="Por exemplo: marcenaria, odontologia.">
              <Input id="segment" name="segment" defaultValue={client?.segment ?? ""} aria-invalid={invalid("segment")} />
            </Field>
            <Field label="Status" htmlFor="status" error={err("status")}>
              <Select id="status" name="status" defaultValue={client?.status ?? "active"} aria-invalid={invalid("status")}>
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CLIENT_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cidade" htmlFor="city" error={err("city")}>
              <Input id="city" name="city" defaultValue={client?.city ?? ""} autoComplete="off" aria-invalid={invalid("city")} />
            </Field>
            <Field label="UF" htmlFor="state" error={err("state")}>
              <Select id="state" name="state" defaultValue={client?.state ?? ""} aria-invalid={invalid("state")}>
                <option value="">Selecione</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Logo"
              htmlFor="logo_url"
              error={err("logo_url")}
              hint="Endereço da imagem ou um arquivo da biblioteca de mídia."
              className="sm:col-span-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="logo_url"
                  name="logo_url"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  aria-invalid={invalid("logo_url")}
                />
                <Button variant="secondary" onClick={() => setPickerOpen(true)} className="justify-center">
                  <ImageIcon className="size-4" aria-hidden />
                  Escolher na biblioteca
                </Button>
              </div>
            </Field>
            <Field
              label="Cor da marca"
              htmlFor="brand_color"
              error={err("brand_color")}
              hint="Aparece ao lado do nome do cliente nas listas."
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={validColor}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Escolher cor da marca"
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-line-strong bg-surface p-1"
                />
                <Input
                  id="brand_color"
                  name="brand_color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.trim())}
                  placeholder="#1F5FBF"
                  maxLength={7}
                  className="font-mono text-[14px]"
                  aria-invalid={invalid("brand_color")}
                />
                {color ? (
                  <Button variant="ghost" onClick={() => setColor("")}>
                    Remover
                  </Button>
                ) : null}
              </div>
            </Field>
            <Field
              label="Observações internas"
              htmlFor="notes"
              error={err("notes")}
              hint="Só a equipe vê. Não é usado pela IA."
              className="sm:col-span-2"
            >
              <Textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} aria-invalid={invalid("notes")} />
            </Field>
          </div>
        </Panel>

        <Panel title="Contato" description="Quem aprova os conteúdos do lado do cliente.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome do contato" htmlFor="contact_name" error={err("contact_name")} className="sm:col-span-2">
              <Input
                id="contact_name"
                name="contact_name"
                defaultValue={client?.contact_name ?? ""}
                autoComplete="off"
                aria-invalid={invalid("contact_name")}
              />
            </Field>
            <Field label="E-mail" htmlFor="email" error={err("email")}>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                defaultValue={client?.email ?? ""}
                autoComplete="off"
                aria-invalid={invalid("email")}
              />
            </Field>
            <Field label="Telefone" htmlFor="phone" error={err("phone")}>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={client?.phone ?? ""}
                autoComplete="off"
                aria-invalid={invalid("phone")}
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Voz da marca"
          description="Tom de voz, público, cidade e palavras-chave alimentam a IA quando ela adapta um artigo para o site deste cliente. Quanto mais específico, menos o texto se parece com o de outros clientes."
        >
          <div className="grid gap-5">
            <Field
              label="Tom de voz"
              htmlFor="tone_of_voice"
              error={err("tone_of_voice")}
              hint="Como a marca fala. Por exemplo: próximo e técnico, sem gírias, trata o leitor por você."
            >
              <Textarea
                id="tone_of_voice"
                name="tone_of_voice"
                rows={4}
                defaultValue={client?.tone_of_voice ?? ""}
                aria-invalid={invalid("tone_of_voice")}
              />
            </Field>
            <Field
              label="Público-alvo"
              htmlFor="audience"
              error={err("audience")}
              hint="Quem lê o blog. Por exemplo: casais de 30 a 45 anos reformando o primeiro apartamento."
            >
              <Textarea id="audience" name="audience" rows={2} defaultValue={client?.audience ?? ""} aria-invalid={invalid("audience")} />
            </Field>
            <Field
              label="Palavras-chave prioritárias"
              htmlFor="keywords"
              error={err("keywords")}
              hint="Tecle Enter ou vírgula para adicionar cada uma."
            >
              <KeywordInput id="keywords" name="keywords" defaultValue={client?.keywords ?? []} invalid={Boolean(err("keywords"))} />
            </Field>
          </div>
        </Panel>

        {state && !state.ok && !state.fieldErrors ? (
          <p role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-2 rounded-[var(--radius-panel)] border border-line bg-surface/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          {isNew ? (
            <Link href="/clientes" className={buttonClass("ghost", "md", "justify-center")}>
              Cancelar
            </Link>
          ) : null}
          <Button type="submit" loading={pending} className="justify-center">
            {isNew ? "Cadastrar cliente" : "Salvar cliente"}
          </Button>
        </div>
      </form>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(m) => {
          setLogoUrl(m.url);
          setPickerOpen(false);
        }}
        clientId={client?.id}
      />
    </>
  );
}
