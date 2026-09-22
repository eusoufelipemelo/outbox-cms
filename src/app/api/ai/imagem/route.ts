import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { putImage } from "@/lib/storage";
import { generateImage, imagesEnabled, IMAGE_ASPECTS, IMAGE_MODELS, IMAGE_SIZES, ImageError } from "@/lib/ai/image";
import { MEDIA_COLUMNS, isUuid } from "@/lib/data/media";
import { slugify } from "@/lib/utils";
import { visualDirection, type VisualClient } from "@/lib/ai/visual";
import { dayKey } from "@/components/agenda/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  prompt: z.string().trim().min(10, "Descreva a imagem em pelo menos 10 caracteres.").max(1200),
  aspect: z.enum(IMAGE_ASPECTS).optional(),
  size: z.enum(IMAGE_SIZES).optional(),
  model: z.enum(IMAGE_MODELS).optional(),
  alt: z.string().trim().max(300).optional(),
  clientId: z.string().optional(),
  /** Aplica a identidade visual do cliente (cor da marca, tom e estilo do cadastro). Padrão: sim. */
  useClientStyle: z.boolean().optional(),
});

export async function GET() {
  await requireUser();
  return Response.json({ enabled: imagesEnabled() });
}

/** Gera a imagem no Gemini, guarda no armazenamento do CMS e devolve o registro da Mídia. */
export async function POST(request: Request) {
  const user = await requireUser();
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
  const { prompt, aspect, size, model, alt, clientId, useClientStyle } = parsed.data;

  // identidade visual do cliente, quando a imagem é para um cliente
  let finalPrompt = prompt;
  if (clientId && isUuid(clientId) && useClientStyle !== false) {
    const { data: client } = await db().from("clients").select("name, segment, brand_color, image_style, image_mood").eq("id", clientId).maybeSingle();
    finalPrompt = `${prompt}${visualDirection(client as VisualClient | null)}`;
  }

  try {
    const { bytes, mime } = await generateImage({ prompt: finalPrompt, aspect, size, model, signal: request.signal });
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const [year, month] = dayKey(new Date()).split("-");
    const base = slugify(prompt).slice(0, 50) || "imagem-ia";
    const { path, url } = await putImage(`${year}/${month}/${crypto.randomUUID()}-${base}.${ext}`, bytes, mime);

    const { data: row, error } = await db()
      .from("media")
      .insert({
        path,
        url,
        alt: alt || null,
        mime,
        size: bytes.byteLength,
        client_id: clientId && isUuid(clientId) ? clientId : null,
        created_by: user.id,
      })
      .select(MEDIA_COLUMNS)
      .single();
    if (error || !row) return Response.json({ error: "A imagem foi gerada, mas não entrou na biblioteca. Tente de novo." }, { status: 500 });
    return Response.json(row, { status: 201 });
  } catch (err) {
    if (err instanceof ImageError) return Response.json({ error: err.message }, { status: err.status });
    console.error("[imagem] falha:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Não foi possível gerar a imagem agora. Tente de novo." }, { status: 502 });
  }
}
