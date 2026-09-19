import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { putImage } from "@/lib/storage";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, type MediaMime } from "@/components/media/constants";

export const dynamic = "force-dynamic";

function sniff(b: Uint8Array): MediaMime | null {
  const ascii = (f: number, t: number) => String.fromCharCode(...b.subarray(f, t));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

/** Foto do perfil: grava no armazenamento de imagens (R2) e atualiza profiles.avatar_url. */
export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Escolha uma foto." }, { status: 400 });
  if (file.size > MEDIA_MAX_BYTES) return Response.json({ error: "A foto passou de 2 MB. Escolha outra." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes.subarray(0, 16));
  if (!mime) return Response.json({ error: "Formato não aceito. Envie JPG, PNG ou WebP." }, { status: 415 });

  try {
    const { url } = await putImage(`avatars/${user.id}/${crypto.randomUUID()}.${MEDIA_TYPES[mime]}`, bytes, mime);
    const { error } = await db().from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (error) throw new Error(error.message);
    return Response.json({ url });
  } catch (err) {
    console.error("[avatar] envio falhou:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Não foi possível salvar a foto. Tente de novo." }, { status: 502 });
  }
}
