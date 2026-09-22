import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rotas abertas: Content API pública, script de embed, agendador, retorno dos links de e-mail/Google, relatórios e prévias por token e o webhook do Telegram.
const PUBLIC_PREFIXES = ["/api/v1", "/embed.js", "/api/cron", "/api/health", "/auth/", "/relatorio", "/previa", "/api/telegram"];
// Telas de entrada: abrem sem login (o proxy só renova a sessão, nunca redireciona).
// /redefinir-senha e /aguardando-aprovacao conferem a sessão na própria página.
const AUTH_PAGES = ["/login", "/cadastro", "/esqueci-senha", "/redefinir-senha", "/aguardando-aprovacao"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`));
}

function decodable(path: string): boolean {
  try {
    decodeURIComponent(path);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Slug com codificação quebrada (ex.: %E0%A4%A) não chega a virar erro no roteador: é só um artigo inexistente.
  if (pathname.startsWith("/api/v1/posts/") && !decodable(pathname)) {
    return NextResponse.json(
      { error: "Artigo não encontrado neste site. Confira o slug ou se o artigo está publicado aqui." },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } },
    );
  }
  if (matches(pathname, PUBLIC_PREFIXES)) return NextResponse.next();
  // Se o Supabase não reconhecer o redirectTo, ele manda o código para a Site URL (/?code=...).
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const callback = request.nextUrl.clone();
    callback.pathname = "/auth/callback";
    return NextResponse.redirect(callback);
  }
  const authPage = matches(pathname, AUTH_PAGES);

  let response = NextResponse.next({ request });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (authPage) return response;
  if (!data.user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
