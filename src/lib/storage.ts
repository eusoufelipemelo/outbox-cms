import "server-only";
import { AwsClient } from "aws4fetch";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase/admin";

/**
 * Armazenamento das imagens. Cloudflare R2 quando configurado (grátis até 10 GB e sem custo de
 * download), Supabase Storage como alternativa. Objetos do R2 ficam gravados com o prefixo "r2:"
 * na coluna `media.path`, para a exclusão saber onde apagar.
 */

const R2_PREFIX = "r2:";
let r2Client: { key: string; client: AwsClient } | null = null;

function r2() {
  const cfg = env.r2;
  if (!cfg) return null;
  if (r2Client?.key !== cfg.accessKeyId) {
    r2Client = {
      key: cfg.accessKeyId,
      client: new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: "s3", region: "auto" }),
    };
  }
  const base = `https://${cfg.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(cfg.bucket)}`;
  return { cfg, client: r2Client.client, objectUrl: (key: string) => `${base}/${key.split("/").map(encodeURIComponent).join("/")}` };
}

export function storageProvider(): "r2" | "supabase" {
  return env.r2 ? "r2" : "supabase";
}

/** Envia o arquivo e devolve o caminho gravado no banco e a URL pública. */
export async function putImage(key: string, bytes: Uint8Array, mime: string): Promise<{ path: string; url: string }> {
  const r = r2();
  if (r) {
    const res = await r.client.fetch(r.objectUrl(key), {
      method: "PUT",
      body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
      headers: { "content-type": mime, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`R2 recusou o envio (HTTP ${res.status})`);
    return { path: `${R2_PREFIX}${key}`, url: `${r.cfg.publicUrl}/${key}` };
  }
  const storage = db().storage.from("media");
  const { error } = await storage.upload(key, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return { path: key, url: storage.getPublicUrl(key).data.publicUrl };
}

/** Apaga o arquivo no armazenamento onde ele foi gravado. */
export async function deleteImage(path: string): Promise<void> {
  if (path.startsWith(R2_PREFIX)) {
    const r = r2();
    if (!r) throw new Error("R2 não está configurado para apagar este arquivo.");
    const res = await r.client.fetch(r.objectUrl(path.slice(R2_PREFIX.length)), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`R2 recusou a exclusão (HTTP ${res.status})`);
    return;
  }
  const { error } = await db().storage.from("media").remove([path]);
  if (error) throw new Error(error.message);
}
