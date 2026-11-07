import { getClientAccess, PREVIEW_BLOCKED } from "@/lib/client-auth";
import { db } from "@/lib/supabase/admin";
import { putImage } from "@/lib/storage";
import { sniffImage } from "@/lib/sniff-image";
import { MEDIA_MAX_BYTES, MEDIA_TYPES } from "@/components/media/constants";

export const dynamic = "force-dynamic";

/** Conta de cliente com acesso (pendente ou liberada) que pode mexer na própria foto. */
async function clientAccount(): Promise<{ id: string } | Response> {
  const access = await getClientAccess();
  if (access.state === "active" && access.preview) return Response.json({ error: PREVIEW_BLOCKED }, { status: 403 });
  if (access.state !== "active" && access.state !== "pending") return Response.json({ error: "Entre na área do cliente para trocar a foto." }, { status: 401 });
  return { id: access.account.id };
}

/** Foto de perfil do cliente: grava no armazenamento de imagens e atualiza profiles.avatar_url. */
export async function POST(request: Request) {
  const account = await clientAccount();
  if (account instanceof Response) return account;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Escolha uma foto." }, { status: 400 });
  if (file.size > MEDIA_MAX_BYTES) return Response.json({ error: "A foto passou de 2 MB. Escolha outra." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes.subarray(0, 16));
  if (!mime) return Response.json({ error: "Formato não aceito. Envie JPG, PNG ou WebP." }, { status: 415 });

  try {
    const { url } = await putImage(`avatars/${account.id}/${crypto.randomUUID()}.${MEDIA_TYPES[mime]}`, bytes, mime);
    const { error } = await db().from("profiles").update({ avatar_url: url }).eq("id", account.id).eq("role", "client");
    if (error) throw new Error(error.message);
    return Response.json({ url });
  } catch (err) {
    console.error("[cliente/avatar] envio falhou:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Não foi possível salvar a foto. Tente de novo." }, { status: 502 });
  }
}

/** Tira a foto de perfil (volta às iniciais). */
export async function DELETE() {
  const account = await clientAccount();
  if (account instanceof Response) return account;
  const { error } = await db().from("profiles").update({ avatar_url: null }).eq("id", account.id).eq("role", "client");
  if (error) return Response.json({ error: "Não foi possível tirar a foto. Tente de novo." }, { status: 502 });
  return Response.json({ ok: true });
}
