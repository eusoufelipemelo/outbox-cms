import { requireUser } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { slugify } from "@/lib/utils";
import { MEDIA_COLUMNS, isUuid, listMedia } from "@/lib/data/media";
import { MEDIA_ALT_MAX, MEDIA_MAX_BYTES, MEDIA_TYPES, formatBytes, type MediaMime } from "@/components/media/constants";
import { dayKey } from "@/components/agenda/dates";
import { deleteImage, putImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return Response.json({ error }, { status });
}

/** Confere a assinatura do arquivo, sem confiar no tipo declarado pelo navegador. */
function sniff(bytes: Uint8Array): MediaMime | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

function dimension(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 30000 ? n : null;
}

export async function POST(request: Request) {
  const user = await requireUser();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Não foi possível ler o arquivo enviado. Confira se a imagem tem até 2 MB e tente de novo.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return fail("Nenhuma imagem recebida. Escolha um arquivo e envie de novo.");
  if (file.size === 0) return fail("O arquivo está vazio. Escolha outra imagem.");
  if (file.size > MEDIA_MAX_BYTES) {
    return fail(`A imagem tem ${formatBytes(file.size)} e o limite é 2 MB. Comprima o arquivo e envie de novo.`, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes.subarray(0, 16));
  if (!mime) return fail("Formato não aceito. Envie JPG, PNG, WebP, GIF ou AVIF.", 415);

  const rawAlt = form.get("alt");
  const alt = typeof rawAlt === "string" ? rawAlt.replace(/\s+/g, " ").trim() : "";
  if (alt.length > MEDIA_ALT_MAX) return fail(`O texto alternativo passou de ${MEDIA_ALT_MAX} caracteres. Resuma a descrição.`);

  const rawClient = form.get("client_id");
  let clientId: string | null = null;
  if (typeof rawClient === "string" && rawClient) {
    if (!isUuid(rawClient)) return fail("Cliente inválido. Recarregue a página e tente de novo.");
    const { data } = await db().from("clients").select("id").eq("id", rawClient).maybeSingle();
    if (!data) return fail("Cliente não encontrado. Ele pode ter sido removido.");
    clientId = rawClient;
  }

  const base = slugify(file.name.replace(/\.[^.]+$/, "")).slice(0, 60) || "imagem";
  const [year, month] = dayKey(new Date()).split("-");
  const key = `${year}/${month}/${crypto.randomUUID()}-${base}.${MEDIA_TYPES[mime]}`;

  let path: string;
  let url: string;
  try {
    ({ path, url } = await putImage(key, bytes, mime));
  } catch (err) {
    console.error("[media] envio falhou:", err instanceof Error ? err.message : err);
    return fail("O armazenamento recusou a imagem. Tente de novo em instantes.", 502);
  }
  const { data: row, error } = await db()
    .from("media")
    .insert({
      path,
      url,
      alt: alt || null,
      mime,
      size: file.size,
      width: dimension(form.get("width")),
      height: dimension(form.get("height")),
      client_id: clientId,
      created_by: user.id,
    })
    .select(MEDIA_COLUMNS)
    .single();

  if (error || !row) {
    await deleteImage(path).catch(() => {});
    return fail("A imagem foi enviada, mas não entrou na biblioteca. Tente de novo.", 500);
  }
  return Response.json(row, { status: 201 });
}

export async function GET(request: Request) {
  await requireUser();
  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? 0);
  try {
    const result = await listMedia({
      q: searchParams.get("q"),
      clientId: searchParams.get("client_id"),
      page: Number.isFinite(page) ? page : 0,
    });
    return Response.json(result);
  } catch {
    return fail("Não foi possível carregar a biblioteca. Tente de novo.", 500);
  }
}
