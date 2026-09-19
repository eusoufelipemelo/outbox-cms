import type { NextRequest } from "next/server";
import { buildSiteJsonLd, siteOrganization } from "@/lib/content";
import { joinUrl } from "@/lib/utils";
import { authSite, json, preflight, safely } from "../_lib/http";

// GET /api/v1/site?key=pk_… → dados públicos do site e da empresa (rodapé, schema da home, IndexNow).
export async function GET(req: NextRequest) {
  return safely(async () => {
    const auth = await authSite(req);
    if (auth.error) return auth.error;
    const site = auth.site;
    return json({
      name: site.name,
      url: site.url,
      blog_path: site.blog_path,
      blog_url: joinUrl(site.url, site.blog_path),
      organization: siteOrganization(site),
      // Chave pública do IndexNow: o site serve este valor em /{indexnow_key}.txt
      indexnow_key: site.indexnow_key,
      // Organization/LocalBusiness + WebSite, pronto para a home e o layout
      json_ld: buildSiteJsonLd(site),
    });
  });
}

export function OPTIONS() {
  return preflight();
}
