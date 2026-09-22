"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState, type FormEvent, type KeyboardEvent } from "react";
import { ImageIcon, X } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { MediaPicker } from "@/components/media/media-picker";
import { saveClient } from "@/lib/data/client-actions";
import type { ActionResult, Client } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IMAGE_MOODS } from "@/lib/ai/visual";
import { CLIENT_STATUS, CLIENT_STATUSES, UFS } from "./options";

type State = ActionResult<{ id: string }> | null;

/** Sugestões do campo Segmento (texto livre): a OutBox atende qualquer nicho. */
const SEGMENT_SUGGESTIONS = [
  "Odontologia",
  "Clínica médica",
  "Dermatologia",
  "Oftalmologia",
  "Ortopedia",
  "Pediatria",
  "Psicologia",
  "Nutrição",
  "Fisioterapia",
  "Estética facial e corporal",
  "Clínica veterinária",
  "Pet shop",
  "Farmácia",
  "Laboratório de análises clínicas",
  "Advocacia",
  "Contabilidade",
  "Consultoria empresarial",
  "Corretora de seguros",
  "Consórcios e financiamentos",
  "Imobiliária",
  "Construtora",
  "Arquitetura",
  "Design de interiores",
  "Marcenaria e móveis planejados",
  "Materiais de construção",
  "Energia solar",
  "Climatização e ar-condicionado",
  "Engenharia",
  "Indústria",
  "Distribuidora",
  "Logística e transporte",
  "Oficina mecânica",
  "Concessionária e revenda de veículos",
  "Varejo de moda",
  "Loja de móveis e decoração",
  "Supermercado",
  "E-commerce",
  "Restaurante",
  "Padaria e confeitaria",
  "Bar e cervejaria",
  "Hotel e pousada",
  "Agência de viagens",
  "Eventos e buffet",
  "Escola",
  "Curso livre e idiomas",
  "Faculdade",
  "Academia",
  "Salão de beleza e barbearia",
  "Tecnologia e software",
  "Agronegócio",
  "Limpeza e conservação",
  "Segurança eletrônica",
  "Gráfica",
  "Fotografia",
  "Organização sem fins lucrativos",
];

/**
 * Campo de etiquetas: Enter ou vírgula adicionam, Backspace no campo vazio remove a última.
 * Envia cada etiqueta como `name` e o texto ainda não confirmado como `${name}_draft`.
 */
function TagInput({
  id,
  name,
  defaultValue,
  invalid,
  maxLength,
  placeholder,
  itemLabel,
}: {
  id: string;
  name: string;
  defaultValue: string[];
  invalid?: boolean;
  maxLength: number;
  placeholder: string;
  /** Nome do item no rótulo do botão de remover, ex.: "palavra-chave". */
  itemLabel: string;
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw
      .split(",")
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    if (parts.length === 0) return;
    setTags((current) => {
      const next = [...current];
      for (const p of parts) {
        if (p.length <= maxLength && !next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p);
      }
      return next;
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      setTags((current) => current.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1.5 transition-colors duration-150 hover:border-line-hover focus-within:border-ink focus-within:ring-2 focus-within:ring-brand/25",
        invalid && "border-danger",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-chip)] border border-line bg-sunken pr-0.5 pl-2.5 text-[13px] text-text"
        >
          {tag}
          <input type="hidden" name={name} value={tag} />
          <button
            type="button"
            onClick={() => setTags((current) => current.filter((t) => t !== tag))}
            aria-label={`Remover ${itemLabel} ${tag}`}
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-line hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        name={`${name}_draft`}
        value={draft}
        maxLength={maxLength}
        onChange={(e) => {
          const value = e.target.value;
          if (value.includes(",")) {
            add(value);
            setDraft("");
          } else {
            setDraft(value);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
        aria-invalid={invalid || undefined}
        placeholder={tags.length === 0 ? placeholder : "Adicionar outro"}
        className="h-7 min-w-[10ch] flex-1 bg-transparent px-1 text-[15px] text-text placeholder:text-faint focus:outline-none"
      />
    </div>
  );
}

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
            <Field
              label="Segmento"
              htmlFor="segment"
              error={err("segment")}
              hint="Escreva livremente ou escolha uma sugestão. Define exemplos, vocabulário e regras do setor na IA."
            >
              <Input
                id="segment"
                name="segment"
                list="segment-suggestions"
                defaultValue={client?.segment ?? ""}
                maxLength={80}
                autoComplete="off"
                aria-invalid={invalid("segment")}
              />
              <datalist id="segment-suggestions">
                {SEGMENT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
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
            <Field
              label="Tom das imagens"
              htmlFor="image_mood"
              error={err("image_mood")}
              hint="Aplicado a toda imagem gerada por IA para este cliente."
            >
              <Select id="image_mood" name="image_mood" defaultValue={client?.image_mood ?? "auto"}>
                {IMAGE_MOODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Estilo das imagens"
              htmlFor="image_style"
              error={err("image_style")}
              hint="Ex.: fundo escuro quase preto, detalhes em laranja, fotografia editorial de marcenaria."
            >
              <Textarea
                id="image_style"
                name="image_style"
                rows={2}
                maxLength={600}
                defaultValue={client?.image_style ?? ""}
                aria-invalid={invalid("image_style")}
              />
            </Field>
            <Field label="Início do contrato" htmlFor="contract_start" error={err("contract_start")} hint="Quando o cliente entrou.">
              <Input id="contract_start" name="contract_start" type="date" defaultValue={client?.contract_start ?? ""} aria-invalid={invalid("contract_start")} />
            </Field>
            <Field label="Término do contrato" htmlFor="contract_end" error={err("contract_end")} hint="Deixe vazio se não tiver prazo. A automação para nesta data.">
              <Input id="contract_end" name="contract_end" type="date" defaultValue={client?.contract_end ?? ""} aria-invalid={invalid("contract_end")} />
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
          description="Tom de voz, público, cidade e palavras-chave alimentam a IA quando ela escreve ou adapta artigos para este cliente. Quanto mais específico, menos o texto se parece com o de outros clientes."
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
              <TagInput
                id="keywords"
                name="keywords"
                defaultValue={client?.keywords ?? []}
                invalid={Boolean(err("keywords"))}
                maxLength={60}
                placeholder="Digite e tecle Enter"
                itemLabel="palavra-chave"
              />
            </Field>
          </div>
        </Panel>

        <Panel
          title="Presença para Google e IAs"
          description="Descreve o cliente como empresa para buscadores e assistentes de IA, e entra no contexto dos artigos gerados. Preencha só o que for verdade e puder ser público."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Sobre a empresa"
              htmlFor="about"
              error={err("about")}
              hint="O que a empresa faz, em 2 ou 3 frases. É o texto que IAs usam para descrever o cliente."
              className="sm:col-span-2"
            >
              <Textarea id="about" name="about" rows={3} maxLength={600} defaultValue={client?.about ?? ""} aria-invalid={invalid("about")} />
            </Field>
            <Field
              label="Serviços e produtos"
              htmlFor="services"
              error={err("services")}
              hint="Tecle Enter ou vírgula para adicionar cada um, com o nome usado no site do cliente."
              className="sm:col-span-2"
            >
              <TagInput
                id="services"
                name="services"
                defaultValue={client?.services ?? []}
                invalid={Boolean(err("services"))}
                maxLength={80}
                placeholder="Digite um serviço e tecle Enter"
                itemLabel="serviço"
              />
            </Field>
            <Field
              label="Área de atendimento"
              htmlFor="service_area"
              error={err("service_area")}
              hint="Onde o cliente atende. Por exemplo: Curitiba e região metropolitana, ou todo o Brasil."
              className="sm:col-span-2"
            >
              <Input
                id="service_area"
                name="service_area"
                maxLength={200}
                defaultValue={client?.service_area ?? ""}
                aria-invalid={invalid("service_area")}
              />
            </Field>
            <Field
              label="Endereço"
              htmlFor="address"
              error={err("address")}
              hint="Completo, como no Google Meu Negócio. Deixe vazio se não atende no local."
            >
              <Input
                id="address"
                name="address"
                maxLength={300}
                defaultValue={client?.address ?? ""}
                autoComplete="off"
                aria-invalid={invalid("address")}
              />
            </Field>
            <Field
              label="Horário de atendimento"
              htmlFor="opening_hours"
              error={err("opening_hours")}
              hint="Por exemplo: segunda a sexta, das 8h às 18h."
            >
              <Input
                id="opening_hours"
                name="opening_hours"
                maxLength={300}
                defaultValue={client?.opening_hours ?? ""}
                aria-invalid={invalid("opening_hours")}
              />
            </Field>
            <Field
              label="Perfis e links oficiais"
              htmlFor="social_links"
              error={err("social_links")}
              hint="Um endereço por linha: Instagram, LinkedIn, YouTube, Google Meu Negócio. Ajuda as IAs a reconhecer a empresa."
              className="sm:col-span-2"
            >
              <Textarea
                id="social_links"
                name="social_links"
                rows={3}
                inputMode="url"
                placeholder="https://instagram.com/cliente"
                defaultValue={(client?.social_links ?? []).join("\n")}
                className="font-mono text-[14px]"
                aria-invalid={invalid("social_links")}
              />
            </Field>
            <Field
              label="Especialista responsável"
              htmlFor="expert_name"
              error={err("expert_name")}
              hint="Quem assina ou revisa o conteúdo. Mostra experiência real para Google e IAs."
            >
              <Input
                id="expert_name"
                name="expert_name"
                maxLength={120}
                defaultValue={client?.expert_name ?? ""}
                autoComplete="off"
                aria-invalid={invalid("expert_name")}
              />
            </Field>
            <Field
              label="Credenciais do especialista"
              htmlFor="expert_credentials"
              error={err("expert_credentials")}
              hint="Por exemplo: Cirurgiã-dentista, CRO-PR 12345."
            >
              <Input
                id="expert_credentials"
                name="expert_credentials"
                maxLength={200}
                defaultValue={client?.expert_credentials ?? ""}
                aria-invalid={invalid("expert_credentials")}
              />
            </Field>
            <Field
              label="Minibiografia do especialista"
              htmlFor="expert_bio"
              error={err("expert_bio")}
              hint="Formação e experiência, em 2 ou 3 frases."
              className="sm:col-span-2"
            >
              <Textarea
                id="expert_bio"
                name="expert_bio"
                rows={3}
                maxLength={1500}
                defaultValue={client?.expert_bio ?? ""}
                aria-invalid={invalid("expert_bio")}
              />
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
