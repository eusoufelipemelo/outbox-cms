"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Braces, KeyRound, LayoutTemplate, Webhook, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { saveSite } from "@/lib/data/site-actions";
import type { SiteFormValues } from "@/lib/data/sites";
import type { ActionResult, SitePlatform } from "@/lib/types";
import { cn, joinUrl, normalizeUrl } from "@/lib/utils";
import { PLATFORM, SITE_PLATFORMS } from "./options";

type State = ActionResult<{ id: string }> | null;

const PLATFORM_ICON: Record<SitePlatform, LucideIcon> = {
  api: Braces,
  wordpress: LayoutTemplate,
  webhook: Webhook,
};

function previewUrl(url: string, blogPath: string): string | null {
  if (!url.trim()) return null;
  const path = blogPath.trim().replace(/^\/+|\/+$/g, "") || "blog";
  return `${joinUrl(normalizeUrl(url), path)}/nome-do-artigo`;
}

export function SiteForm({ clientId, site }: { clientId: string; site?: SiteFormValues }) {
  const router = useRouter();
  const isNew = !site;
  const [platform, setPlatform] = useState<SitePlatform>(site?.platform ?? "api");
  const [url, setUrl] = useState(site?.url ?? "");
  const [blogPath, setBlogPath] = useState(site?.blog_path ?? "/blog");
  const [replacingPassword, setReplacingPassword] = useState(false);
  const hasSavedPassword = Boolean(site?.has_wp_password);

  const [state, formAction, pending] = useActionState<State, FormData>(async (prev, formData) => {
    const result = await saveSite(prev, formData);
    if (result.ok) {
      toast.success(result.message ?? "Site salvo");
      setReplacingPassword(false);
      if (isNew && result.data) router.replace(`/clientes/${clientId}/sites/${result.data.id}`);
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

  const preview = previewUrl(url, blogPath);

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-6">
      <input type="hidden" name="client_id" value={clientId} />
      {site ? <input type="hidden" name="id" value={site.id} /> : null}

      <Panel title="Dados do site">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Nome do site"
            htmlFor="name"
            error={err("name")}
            hint="Como o destino aparece na hora de publicar, como Site institucional ou Blog da loja."
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={site?.name ?? ""}
              required
              maxLength={120}
              autoFocus={isNew}
              aria-invalid={invalid("name")}
            />
          </Field>
          <Field label="Endereço do site" htmlFor="url" error={err("url")} hint="Pode colar sem https://, o CMS completa.">
            <Input
              id="url"
              name="url"
              inputMode="url"
              autoComplete="off"
              placeholder="www.cliente.com.br"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => {
                if (url.trim()) setUrl(normalizeUrl(url));
              }}
              required
              aria-invalid={invalid("url")}
            />
          </Field>
          <Field
            label="Caminho do blog"
            htmlFor="blog_path"
            error={err("blog_path")}
            hint={
              preview ? (
                <span className="break-all">Os artigos ficam em {preview}</span>
              ) : (
                "Onde os artigos vivem no site. Em branco usa /blog."
              )
            }
          >
            <Input
              id="blog_path"
              name="blog_path"
              autoComplete="off"
              placeholder="/blog"
              value={blogPath}
              onChange={(e) => setBlogPath(e.target.value)}
              className="font-mono text-[14px]"
              aria-invalid={invalid("blog_path")}
            />
          </Field>
          <Field label="Status" htmlFor="status" error={err("status")} hint="Sites pausados não aparecem como destino ao publicar.">
            <Select id="status" name="status" defaultValue={site?.status ?? "active"} aria-invalid={invalid("status")}>
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </Select>
          </Field>
        </div>
      </Panel>

      <Panel
        title="Como o site recebe os artigos"
        description="Escolha o canal de entrega. Dá para trocar depois sem perder as credenciais salvas."
      >
        <fieldset>
          <legend className="sr-only">Canal de entrega</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {SITE_PLATFORMS.map((p) => {
              const Icon = PLATFORM_ICON[p];
              const selected = platform === p;
              return (
                <label
                  key={p}
                  className={cn(
                    "relative flex min-h-[120px] cursor-pointer flex-col gap-2 rounded-[var(--radius-control)] border bg-surface p-4 transition-colors duration-150",
                    "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand",
                    selected ? "notch border-ink" : "border-line-strong hover:border-ink",
                  )}
                >
                  <input type="radio" name="platform" value={p} checked={selected} onChange={() => setPlatform(p)} className="sr-only" />
                  <span className="flex items-center justify-between gap-2">
                    <Icon className={cn("size-5", selected ? "text-ink" : "text-muted")} aria-hidden />
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 items-center justify-center rounded-full border",
                        selected ? "border-ink" : "border-line-strong",
                      )}
                    >
                      {selected ? <span className="size-2 rounded-full bg-ink" /> : null}
                    </span>
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{PLATFORM[p].label}</span>
                  <span className="text-[13px] leading-snug text-muted">{PLATFORM[p].description}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {err("platform") ? (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {err("platform")}
          </p>
        ) : null}

        <div className="mt-6 border-t border-line pt-6">
          {platform === "api" ? (
            <p className="mb-5 rounded-[var(--radius-control)] bg-sunken px-4 py-3 text-sm text-muted">
              {isNew
                ? "Depois de salvar, esta tela mostra a chave pública e o link para o código de integração."
                : "A chave pública e o código de integração estão nesta tela e em Integrações."}
            </p>
          ) : null}

          {platform === "wordpress" ? (
            <div className="mb-5 grid gap-5 sm:grid-cols-2">
              <Field
                label="Endereço do WordPress"
                htmlFor="wp_url"
                error={err("wp_url")}
                hint="Em branco usa o endereço do site."
                className="sm:col-span-2"
              >
                <Input
                  id="wp_url"
                  name="wp_url"
                  inputMode="url"
                  autoComplete="off"
                  defaultValue={site?.wp_url ?? ""}
                  placeholder={url.trim() ? normalizeUrl(url) : "https://www.cliente.com.br"}
                  aria-invalid={invalid("wp_url")}
                />
              </Field>
              <Field
                label="Usuário do WordPress"
                htmlFor="wp_username"
                error={err("wp_username")}
                hint="Precisa ter permissão para publicar posts."
              >
                <Input
                  id="wp_username"
                  name="wp_username"
                  autoComplete="off"
                  defaultValue={site?.wp_username ?? ""}
                  aria-invalid={invalid("wp_username")}
                />
              </Field>

              {hasSavedPassword && !replacingPassword ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-ink" id="wp_app_password_label">
                    Senha de aplicativo
                  </p>
                  <div
                    className="flex min-h-12 items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-sunken py-1 pr-1 pl-3"
                    aria-labelledby="wp_app_password_label"
                    role="group"
                  >
                    <span className="flex items-center gap-2 text-sm text-text">
                      <KeyRound className="size-4 text-ok" aria-hidden />
                      Senha salva
                    </span>
                    <Button variant="ghost" onClick={() => setReplacingPassword(true)}>
                      Substituir senha
                    </Button>
                  </div>
                  <p className="text-[13px] text-muted">Por segurança, a senha não é exibida.</p>
                </div>
              ) : (
                <Field
                  label={hasSavedPassword ? "Nova senha de aplicativo" : "Senha de aplicativo"}
                  htmlFor="wp_app_password"
                  error={err("wp_app_password")}
                  hint={
                    hasSavedPassword
                      ? "Em branco mantém a senha salva."
                      : "Crie no WordPress em Usuários, Perfil, Senhas de aplicativo. Não é a senha de login."
                  }
                >
                  <div className="flex gap-2">
                    <Input
                      id="wp_app_password"
                      name="wp_app_password"
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      autoFocus={replacingPassword}
                      aria-invalid={invalid("wp_app_password")}
                    />
                    {hasSavedPassword ? (
                      <Button variant="ghost" onClick={() => setReplacingPassword(false)}>
                        Manter a atual
                      </Button>
                    ) : null}
                  </div>
                </Field>
              )}

              <Field
                label="Status do post no WordPress"
                htmlFor="wp_default_status"
                error={err("wp_default_status")}
                className="sm:col-span-2"
              >
                <Select
                  id="wp_default_status"
                  name="wp_default_status"
                  defaultValue={site?.wp_default_status ?? "publish"}
                  aria-invalid={invalid("wp_default_status")}
                  className="sm:max-w-[320px]"
                >
                  <option value="publish">Publicar na hora</option>
                  <option value="draft">Criar como rascunho para revisão</option>
                </Select>
              </Field>
            </div>
          ) : null}

          {platform === "webhook" ? (
            <Field
              label="URL do webhook"
              htmlFor="webhook_url"
              error={err("webhook_url")}
              hint="O CMS envia um POST assinado com o segredo do webhook a cada publicação, atualização ou remoção."
            >
              <Input
                id="webhook_url"
                name="webhook_url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.cliente.com.br/api/outbox"
                defaultValue={site?.webhook_url ?? ""}
                aria-invalid={invalid("webhook_url")}
              />
            </Field>
          ) : (
            <Field
              label="Avisar a cada publicação (opcional)"
              htmlFor="webhook_url"
              error={err("webhook_url")}
              hint="URL chamada depois de cada entrega. Útil para limpar o cache do site ou disparar uma automação no n8n ou Zapier."
            >
              <Input
                id="webhook_url"
                name="webhook_url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://"
                defaultValue={site?.webhook_url ?? ""}
                aria-invalid={invalid("webhook_url")}
              />
            </Field>
          )}
        </div>
      </Panel>

      <Panel title="Padrões de publicação" description="Aplicados quando o artigo não define autor ou categoria.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Autor padrão" htmlFor="default_author" error={err("default_author")}>
            <Input
              id="default_author"
              name="default_author"
              defaultValue={site?.default_author ?? ""}
              placeholder="Equipe do cliente"
              aria-invalid={invalid("default_author")}
            />
          </Field>
          <Field label="Categoria padrão" htmlFor="default_category" error={err("default_category")}>
            <Input
              id="default_category"
              name="default_category"
              defaultValue={site?.default_category ?? ""}
              placeholder="Blog"
              aria-invalid={invalid("default_category")}
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
          <Link href={`/clientes/${clientId}`} className={buttonClass("ghost", "md", "justify-center")}>
            Cancelar
          </Link>
        ) : null}
        <Button type="submit" loading={pending} className="justify-center">
          {isNew ? "Cadastrar site" : "Salvar site"}
        </Button>
      </div>
    </form>
  );
}
