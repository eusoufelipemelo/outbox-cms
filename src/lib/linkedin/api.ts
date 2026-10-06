import "server-only";
import sharp from "sharp";
import { liAccessToken } from "./oauth";

/** Versão da API (formato AAAAMM). A LinkedIn mantém cada versão por cerca de 1 ano: atualizar uma vez por ano. */
export const LI_VERSION = "202609";
const BASE = "https://api.linkedin.com/rest";

export class LinkedInError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LinkedInError";
  }
}

function friendly(status: number, raw: string): string {
  if (status === 401) return "A autorização da LinkedIn venceu ou foi revogada. Conecte a conta de novo.";
  if (status === 403) return "A LinkedIn negou o acesso. Confira se a conta é administradora da página e se o app já tem o Community Management API aprovado.";
  if (status === 429) return "Limite diário de chamadas da LinkedIn atingido. Tente de novo amanhã.";
  return `LinkedIn: ${raw}`.slice(0, 300);
}

async function call<T>(path: string, init: RequestInit = {}): Promise<{ data: T; headers: Headers }> {
  const token = await liAccessToken();
  const res = await fetch(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "linkedin-version": LI_VERSION,
      "x-restli-protocol-version": "2.0.0",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const raw = (data as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new LinkedInError(friendly(res.status, raw), res.status);
  }
  return { data: data as T, headers: res.headers };
}

export type LiOrg = { urn: string; name: string; vanityName: string | null; website: string | null };

/** Páginas de empresa em que a conta conectada é administradora. */
export async function listAdminOrgs(): Promise<LiOrg[]> {
  const urns = new Set<string>();
  for (let start = 0; start < 1000; start += 100) {
    const { data } = await call<{ elements?: { organization?: string; organizationTarget?: string }[] }>(
      `/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100&start=${start}`,
    );
    const items = data.elements ?? [];
    for (const e of items) {
      const urn = e.organization ?? e.organizationTarget;
      if (urn?.startsWith("urn:li:organization:")) urns.add(urn);
    }
    if (items.length < 100) break;
  }
  const out: LiOrg[] = [];
  // uma chamada por página: o nível inicial de acesso não permite busca em lote
  for (const urn of urns) {
    const id = urn.split(":").pop();
    try {
      const { data } = await call<{ localizedName?: string; vanityName?: string; localizedWebsite?: string }>(`/organizations/${id}`);
      out.push({ urn, name: data.localizedName ?? `Página ${id}`, vanityName: data.vanityName ?? null, website: data.localizedWebsite ?? null });
    } catch {
      out.push({ urn, name: `Página ${id}`, vanityName: null, website: null });
    }
  }
  return out;
}

/** Envia uma imagem (a LinkedIn aceita JPG, PNG e GIF; as capas do CMS são WebP, então vira JPEG). */
export async function uploadImage(ownerUrn: string, imageUrl: string): Promise<string> {
  const src = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!src.ok) throw new LinkedInError(`Não foi possível baixar a capa (HTTP ${src.status}).`, 502);
  const jpeg = await sharp(Buffer.from(await src.arrayBuffer()))
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const { data } = await call<{ value?: { uploadUrl?: string; image?: string } }>("/images?action=initializeUpload", {
    method: "POST",
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });
  const uploadUrl = data.value?.uploadUrl;
  const image = data.value?.image;
  if (!uploadUrl || !image) throw new LinkedInError("A LinkedIn não liberou o envio da imagem.", 502);

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: `Bearer ${await liAccessToken()}`, "content-type": "image/jpeg" },
    body: new Uint8Array(jpeg),
    signal: AbortSignal.timeout(60_000),
  });
  if (!put.ok) throw new LinkedInError(`A LinkedIn recusou a imagem (HTTP ${put.status}).`, put.status);
  return image;
}

/**
 * Texto no formato "little" da LinkedIn: estes caracteres precisam de barra invertida para
 * aparecer como texto (sem isso o post é cortado ou recusado).
 */
export function littleText(text: string): string {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
}

export function hashtag(tag: string): string {
  const clean = tag.replace(/^#/, "").replace(/[^\p{L}\p{N}]/gu, "");
  return clean ? `{hashtag|\\#|${clean}}` : "";
}

/** Cria o post na página: texto + cartão do artigo (link, título, descrição e capa). Devolve o URN do post. */
export async function createArticlePost(input: {
  author: string;
  commentary: string;
  url: string;
  title: string;
  description: string;
  thumbnail?: string | null;
}): Promise<string> {
  const { headers } = await call<unknown>("/posts", {
    method: "POST",
    body: JSON.stringify({
      author: input.author,
      commentary: input.commentary.slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: {
        article: {
          source: input.url,
          title: input.title.slice(0, 200),
          description: input.description.slice(0, 300),
          ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  return headers.get("x-restli-id") ?? "";
}

/** Endereço público do post. */
export function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${urn}/`;
}
