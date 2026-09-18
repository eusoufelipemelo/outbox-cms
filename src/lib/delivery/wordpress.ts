import "server-only";
import { createHash } from "node:crypto";
import type { Site } from "@/lib/types";
import { normalizeUrl, slugify } from "@/lib/utils";
import { DeliveryError, readBody, request, snippet, type ChannelOutcome } from "./http";

export type WordPressSite = Pick<Site, "url" | "wp_url" | "wp_username" | "wp_app_password" | "wp_default_status" | "default_category">;

type WpConfig = { api: string; base: string; auth: string };

/** Monta a URL da API REST e o cabeçalho Basic (senha de aplicativo sem espaços). */
function wpConfig(site: WordPressSite): WpConfig {
  let base = normalizeUrl(site.wp_url || site.url);
  // Aceita URLs coladas com /wp-admin, /wp-json ou /wp-login.php.
  base = base.replace(/\/(wp-admin|wp-json|wp-login\.php)(\/.*)?$/i, "");
  const user = site.wp_username?.trim();
  const pass = site.wp_app_password?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new DeliveryError("Configure o usuário e a senha de aplicativo do WordPress na página do site.");
  }
  return { base, api: `${base}/wp-json/wp/v2`, auth: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

async function wp(cfg: WpConfig, path: string, init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string>; timeoutMs?: number } = {}) {
  const headers: Record<string, string> = { authorization: cfg.auth, accept: "application/json", ...init.headers };
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
    body = JSON.stringify(init.json);
  }
  const res = await request(`${cfg.api}${path}`, { method: init.method ?? "GET", headers, body, timeoutMs: init.timeoutMs ?? 15_000 });
  const { text, json } = await readBody(res);
  return { res, text, json: json as Record<string, unknown> | null };
}

type WpErrorBody = { code?: string; message?: string; data?: { status?: number; term_id?: number } } | null;

/** Converte respostas de erro do WordPress em mensagens acionáveis. */
function wpError(cfg: WpConfig, status: number, text: string, json: unknown): string {
  const body = (json && typeof json === "object" ? json : null) as WpErrorBody;
  const code = body?.code ?? "";
  const wpMsg = body?.message ? snippet(body.message, 160) : "";
  const isHtml = !body && /<html|<!doctype/i.test(text);

  if (status === 401) {
    if (code === "invalid_username" || code === "incorrect_password" || code === "invalid_email") {
      return "Usuário ou senha de aplicativo inválidos. Gere uma nova senha em Usuários → Perfil → Senhas de aplicativo e cole na configuração do site.";
    }
    if (code === "rest_not_logged_in" || code === "rest_forbidden_context") {
      return "O WordPress não reconheceu o login. Confira usuário e senha de aplicativo; se estiverem certos, o servidor pode estar descartando o cabeçalho Authorization ou um plugin de segurança desativou as senhas de aplicativo.";
    }
    return `Usuário ou senha de aplicativo inválidos (HTTP 401).${wpMsg ? ` WordPress: ${wpMsg}` : ""}`;
  }
  if (status === 403) {
    if (isHtml || !code) return "O servidor bloqueou a requisição (HTTP 403). Libere a API REST no firewall ou plugin de segurança do WordPress.";
    return `O usuário do WordPress não tem permissão para esta ação. Use um usuário Editor ou Administrador.${wpMsg ? ` WordPress: ${wpMsg}` : ""}`;
  }
  if (status === 404) {
    if (code === "rest_post_invalid_id") return "O post não existe mais no WordPress.";
    return `API REST do WordPress não encontrada em ${cfg.base}/wp-json. Confira a URL do WordPress e se os links permanentes estão ativos (Configurações → Links permanentes).`;
  }
  if (status === 400) return `O WordPress recusou os dados${wpMsg ? `: ${wpMsg}` : "."}`;
  if (status === 413) return "O arquivo é grande demais para o limite de upload do WordPress.";
  if (status >= 500) return `O WordPress respondeu com erro HTTP ${status}. Tente de novo em alguns minutos.`;
  return `O WordPress respondeu HTTP ${status}.${wpMsg ? ` ${wpMsg}` : ""}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Encontra a categoria/tag pelo nome ou cria se não existir. Retorna o id. */
async function resolveTerm(cfg: WpConfig, taxonomy: "categories" | "tags", name: string): Promise<number> {
  const wanted = name.trim();
  const wantedSlug = slugify(wanted);
  const found = await wp(cfg, `/${taxonomy}?search=${encodeURIComponent(wanted)}&per_page=100&_fields=id,name,slug`);
  if (!found.res.ok) throw new DeliveryError(wpError(cfg, found.res.status, found.text, found.json), found.res.status);
  const list = Array.isArray(found.json) ? (found.json as { id: number; name: string; slug: string }[]) : [];
  const match = list.find((t) => decodeEntities(t.name).toLowerCase() === wanted.toLowerCase() || t.slug === wantedSlug);
  if (match) return match.id;

  const created = await wp(cfg, `/${taxonomy}`, { method: "POST", json: { name: wanted } });
  if (created.res.ok && typeof created.json?.id === "number") return created.json.id;
  const err = created.json as WpErrorBody;
  if (err?.code === "term_exists" && typeof err.data?.term_id === "number") return err.data.term_id;
  throw new DeliveryError(wpError(cfg, created.res.status, created.text, created.json), created.res.status);
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * Garante a imagem destacada. O nome do arquivo leva um hash da URL da capa
 * (`outbox-<hash>.ext`), então só reenviamos quando a capa muda.
 */
async function ensureCover(cfg: WpConfig, coverUrl: string, alt: string, currentFeatured: number): Promise<number> {
  const marker = `outbox-${createHash("sha1").update(coverUrl).digest("hex").slice(0, 12)}`;
  if (currentFeatured > 0) {
    const cur = await wp(cfg, `/media/${currentFeatured}?context=edit&_fields=id,source_url`);
    const src = cur.res.ok && typeof cur.json?.source_url === "string" ? cur.json.source_url : "";
    if (src.includes(marker)) return currentFeatured;
  }

  const img = await request(coverUrl, { timeoutMs: 20_000, retries: 1 });
  if (!img.ok) throw new DeliveryError(`não foi possível baixar a imagem (HTTP ${img.status})`);
  const mime = (img.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) throw new DeliveryError("a URL da capa não aponta para uma imagem");
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.byteLength > 15 * 1024 * 1024) throw new DeliveryError("a imagem tem mais de 15 MB");
  const ext = EXT[mime] ?? (coverUrl.split("?")[0].split(".").pop() || "jpg").slice(0, 5);

  const up = await wp(cfg, "/media", {
    method: "POST",
    body: bytes,
    timeoutMs: 45_000,
    headers: { "content-type": mime, "content-disposition": `attachment; filename="${marker}.${ext}"` },
  });
  if (!up.res.ok || typeof up.json?.id !== "number") throw new DeliveryError(wpError(cfg, up.res.status, up.text, up.json), up.res.status);
  const id = up.json.id;
  if (alt) await wp(cfg, `/media/${id}`, { method: "POST", json: { alt_text: alt } }).catch(() => null);
  return id;
}

export type WordPressInput = {
  externalId: string | null;
  /** Envia `status` (wp_default_status). Sempre enviado ao criar; em atualizações só quando o destino não estava no ar. */
  sendStatus: boolean;
  title: string;
  content_html: string;
  excerpt: string;
  slug: string;
  category: string | null;
  tags: string[];
  cover_url: string | null;
  cover_alt: string | null;
};

export async function wordpressPublish(site: WordPressSite, input: WordPressInput): Promise<ChannelOutcome> {
  const cfg = wpConfig(site);
  const notes: string[] = [];
  let existingId = input.externalId && /^\d+$/.test(input.externalId) ? input.externalId : null;
  let currentFeatured = 0;

  if (existingId) {
    const cur = await wp(cfg, `/posts/${existingId}?context=edit&_fields=id,featured_media,status`);
    if (cur.res.status === 404 || cur.res.status === 410) {
      existingId = null;
      notes.push("O post tinha sido apagado no WordPress e foi criado de novo.");
    } else if (!cur.res.ok) {
      return { ok: false, statusCode: cur.res.status, message: wpError(cfg, cur.res.status, cur.text, cur.json) };
    } else {
      currentFeatured = typeof cur.json?.featured_media === "number" ? cur.json.featured_media : 0;
    }
  }

  const body: Record<string, unknown> = {
    title: input.title,
    content: input.content_html,
    excerpt: input.excerpt,
    slug: input.slug,
  };
  if (!existingId || input.sendStatus) body.status = site.wp_default_status;

  const categoryName = input.category?.trim() || site.default_category?.trim();
  if (categoryName) {
    try {
      body.categories = [await resolveTerm(cfg, "categories", categoryName)];
    } catch (err) {
      notes.push(`Categoria "${categoryName}" não aplicada: ${err instanceof Error ? err.message : err}.`);
    }
  }

  const tagNames = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  if (tagNames.length) {
    const ids: number[] = [];
    let failed = 0;
    for (const tag of tagNames) {
      try {
        ids.push(await resolveTerm(cfg, "tags", tag));
      } catch {
        failed++;
      }
    }
    body.tags = ids;
    if (failed) notes.push(`${failed} de ${tagNames.length} tags não foram aplicadas.`);
  }

  if (input.cover_url) {
    try {
      const mediaId = await ensureCover(cfg, input.cover_url, input.cover_alt ?? input.title, currentFeatured);
      if (mediaId !== currentFeatured) body.featured_media = mediaId;
    } catch (err) {
      notes.push(`Imagem de capa não enviada: ${err instanceof Error ? err.message : err}.`);
    }
  } else if (currentFeatured > 0) {
    body.featured_media = 0;
  }

  const saved = await wp(cfg, existingId ? `/posts/${existingId}` : "/posts", { method: "POST", json: body, timeoutMs: 30_000 });
  if (!saved.res.ok || typeof saved.json?.id !== "number") {
    return { ok: false, statusCode: saved.res.status, message: wpError(cfg, saved.res.status, saved.text, saved.json) };
  }

  const wpStatus = typeof saved.json.status === "string" ? saved.json.status : "";
  const verb = existingId ? "Post atualizado no WordPress" : "Post criado no WordPress";
  const suffix = wpStatus && wpStatus !== "publish" ? ` (status: ${wpStatus === "draft" ? "rascunho" : wpStatus})` : "";
  return {
    ok: true,
    statusCode: saved.res.status,
    message: [`${verb}${suffix}.`, ...notes].join(" "),
    externalId: String(saved.json.id),
    externalUrl: typeof saved.json.link === "string" ? saved.json.link : null,
  };
}

/** Despublicar = voltar para rascunho (não apaga nada no WordPress). */
export async function wordpressUnpublish(site: WordPressSite, externalId: string | null): Promise<ChannelOutcome> {
  if (!externalId) return { ok: true, statusCode: null, message: "O artigo ainda não existia no WordPress." };
  const cfg = wpConfig(site);
  const res = await wp(cfg, `/posts/${externalId}`, { method: "POST", json: { status: "draft" } });
  if (res.res.status === 404 || res.res.status === 410) {
    return { ok: true, statusCode: res.res.status, message: "O post já não existe no WordPress." };
  }
  if (!res.res.ok) return { ok: false, statusCode: res.res.status, message: wpError(cfg, res.res.status, res.text, res.json) };
  return { ok: true, statusCode: res.res.status, message: "Post voltou para rascunho no WordPress." };
}

/** Valida API REST + credenciais + permissões com /users/me. */
export async function wordpressTest(site: WordPressSite): Promise<ChannelOutcome> {
  const cfg = wpConfig(site);
  const me = await wp(cfg, "/users/me?context=edit", { timeoutMs: 10_000 });
  if (!me.res.ok) return { ok: false, statusCode: me.res.status, message: wpError(cfg, me.res.status, me.text, me.json) };
  if (!me.json || typeof me.json.id !== "number") {
    return {
      ok: false,
      statusCode: me.res.status,
      message: `A URL respondeu, mas não parece ser a API REST do WordPress (${cfg.base}/wp-json). Confira a URL do WordPress.`,
    };
  }
  const name = typeof me.json.name === "string" ? me.json.name : "usuário";
  const caps = (me.json.capabilities ?? {}) as Record<string, boolean>;
  if (caps.publish_posts === false || (Object.keys(caps).length > 0 && !caps.publish_posts)) {
    return {
      ok: false,
      statusCode: me.res.status,
      message: `Conectado como ${name}, mas esse usuário não pode publicar posts. Use um usuário Editor ou Administrador.`,
    };
  }
  const noUpload = Object.keys(caps).length > 0 && !caps.upload_files;
  return {
    ok: true,
    statusCode: me.res.status,
    message: `Conectado como ${name}. Pronto para publicar.${noUpload ? " Atenção: sem permissão para enviar imagens, a capa não será enviada." : ""}`,
  };
}
