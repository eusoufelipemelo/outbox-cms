import { requireAdmin } from "@/lib/auth";
import { createShowPost } from "@/lib/show/compose";
import { programById } from "@/lib/show/programs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Gera um post de teste do programa diário (fica como rascunho, não publica). ?programa=plantao */
export async function POST(request: Request) {
  await requireAdmin();
  const id = new URL(request.url).searchParams.get("programa");
  try {
    const post = await createShowPost({ program: programById(id) ?? undefined, status: "draft" });
    return Response.json({ id: post.id, program: post.program.name, title: post.title, urls: post.urls });
  } catch (err) {
    console.error("[programa] teste:", err instanceof Error ? err.message : err);
    return Response.json({ error: err instanceof Error ? err.message : "Falhou." }, { status: 500 });
  }
}
