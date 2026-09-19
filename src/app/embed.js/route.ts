// GET /embed.js — script sem dependências que mostra o blog em qualquer site:
//   <div id="outbox-blog"></div>
//   <script src="https://cms.outboxgroup.com.br/embed.js" data-key="pk_…" async></script>
// Opcionais: data-target (seletor CSS), data-per-page (1–50), data-accent (cor), data-category (nome ou slug).
// Lista em grade com paginação (?pagina=N); ?artigo=<slug> abre o artigo completo (título, descrição,
// canonical e JSON-LD aplicados na página) e registra uma visualização. No artigo, os blocos de GEO
// aparecem quando existem: resposta direta, pontos principais, perguntas frequentes, fontes e autor.

const SCRIPT = String.raw`/*! OutBox CMS embed v1 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) {
    var found = document.querySelectorAll('script[src*="/embed.js"][data-key]');
    script = found[found.length - 1];
  }
  if (!script || script.getAttribute("data-obx-ready")) return;
  script.setAttribute("data-obx-ready", "1");

  var key = script.getAttribute("data-key") || "";
  var api;
  try { api = new URL(script.src, location.href).origin + "/api/v1"; } catch (e) { return; }
  var perPage = parseInt(script.getAttribute("data-per-page") || "9", 10);
  if (!(perPage >= 1)) perPage = 9;
  if (perPage > 50) perPage = 50;
  var category = script.getAttribute("data-category") || "";
  var accent = script.getAttribute("data-accent") || "";
  var targetSel = script.getAttribute("data-target") || "#outbox-blog";

  var root = null;
  try { root = document.querySelector(targetSel); } catch (e) { root = null; }
  if (!root) {
    root = document.createElement("div");
    root.id = "outbox-blog";
    script.parentNode.insertBefore(root, script);
  }
  root.classList.add("obx-root");
  if (accent && window.CSS && CSS.supports && CSS.supports("color", accent)) root.style.setProperty("--obx-accent", accent);

  var CSS_TEXT = [
    ".obx-root{--obx-accent:#F15532;--obx-radius:14px;--obx-line:rgba(127,127,127,.24);font:inherit;color:inherit;line-height:1.5}",
    ".obx-root *,.obx-root *::before,.obx-root *::after{box-sizing:border-box}",
    ".obx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:24px;margin:0;padding:0;list-style:none}",
    ".obx-grid>li{margin:0;padding:0}",
    ".obx-card{display:flex;flex-direction:column;height:100%;border:1px solid var(--obx-line);border-radius:var(--obx-radius);overflow:hidden;text-decoration:none;color:inherit;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}",
    ".obx-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px -14px rgba(0,0,0,.28);border-color:var(--obx-accent)}",
    ".obx-card:focus-visible{outline:2px solid var(--obx-accent);outline-offset:2px}",
    ".obx-cover{aspect-ratio:16/9;background:var(--obx-line);overflow:hidden}",
    ".obx-cover img{display:block;width:100%;height:100%;object-fit:cover}",
    ".obx-body{display:flex;flex:1;flex-direction:column;gap:8px;padding:18px 20px 22px}",
    ".obx-meta{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:.8125em;opacity:.72}",
    ".obx-cat{color:var(--obx-accent);font-weight:600;opacity:1}",
    ".obx-title{margin:0;font-size:1.2em;font-weight:700;line-height:1.3;color:inherit}",
    ".obx-excerpt{margin:0;font-size:.95em;line-height:1.55;opacity:.8;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
    ".obx-more{margin-top:auto;padding-top:6px;font-size:.9em;font-weight:600;color:var(--obx-accent)}",
    ".obx-pager{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;margin-top:32px}",
    ".obx-pager span{font-size:.9em;opacity:.72}",
    ".obx-btn{display:inline-flex;align-items:center;min-height:40px;padding:8px 18px;border:1px solid var(--obx-line);border-radius:999px;background:transparent;color:inherit;font:inherit;text-decoration:none;cursor:pointer}",
    ".obx-btn:hover{border-color:var(--obx-accent);color:var(--obx-accent)}",
    ".obx-btn[aria-disabled=true]{opacity:.4;pointer-events:none}",
    ".obx-state{padding:40px 0;text-align:center;opacity:.75}",
    ".obx-skel{border:1px solid var(--obx-line);border-radius:var(--obx-radius);height:320px;background:linear-gradient(90deg,rgba(127,127,127,.08),rgba(127,127,127,.16),rgba(127,127,127,.08));background-size:200% 100%;animation:obx-pulse 1.4s ease infinite}",
    "@keyframes obx-pulse{0%{background-position:100% 0}100%{background-position:-100% 0}}",
    ".obx-article{max-width:760px;margin:0 auto}",
    ".obx-back{display:inline-flex;align-items:center;gap:6px;min-height:40px;color:var(--obx-accent);font-weight:600;text-decoration:none}",
    ".obx-back:hover{text-decoration:underline}",
    ".obx-article h1.obx-h1{margin:.35em 0 .3em;font-size:clamp(1.75em,4vw,2.5em);line-height:1.15;color:inherit}",
    ".obx-lead{margin:0 0 1em;font-size:1.125em;opacity:.8}",
    ".obx-hero{margin:24px 0 32px;border-radius:var(--obx-radius);overflow:hidden}",
    ".obx-hero img{display:block;width:100%;height:auto}",
    ".obx-content{font-size:1.0625em;line-height:1.75;overflow-wrap:break-word}",
    ".obx-content>*+*{margin-top:1.1em}",
    ".obx-content h2{margin-top:1.8em;font-size:1.5em;line-height:1.25}",
    ".obx-content h3{margin-top:1.5em;font-size:1.25em;line-height:1.3}",
    ".obx-content a{color:var(--obx-accent);text-decoration:underline;text-underline-offset:3px}",
    ".obx-content img,.obx-content video,.obx-content iframe{max-width:100%;height:auto;border-radius:10px}",
    ".obx-content blockquote{margin-left:0;padding-left:1em;border-left:3px solid var(--obx-accent);font-style:italic;opacity:.85}",
    ".obx-content pre{overflow-x:auto;padding:1em;border-radius:10px;background:rgba(127,127,127,.1)}",
    ".obx-content table{display:block;overflow-x:auto;border-collapse:collapse}",
    ".obx-content th,.obx-content td{padding:.5em .75em;border:1px solid var(--obx-line)}",
    ".obx-answer{margin:0 0 28px;padding:16px 20px;border-left:3px solid var(--obx-accent);border-radius:0 var(--obx-radius) var(--obx-radius) 0;background:rgba(127,127,127,.08)}",
    ".obx-answer p{margin:0;font-size:1.0625em;line-height:1.6}",
    ".obx-label{display:block;margin:0 0 6px;font-size:.8125em;font-weight:700;letter-spacing:.02em;color:var(--obx-accent)}",
    ".obx-box{margin:28px 0;padding:18px 22px;border:1px solid var(--obx-line);border-radius:var(--obx-radius)}",
    ".obx-box h2{margin:0 0 10px;font-size:1.125em;line-height:1.3}",
    ".obx-box ul{margin:0;padding-left:1.2em}",
    ".obx-box li+li{margin-top:6px}",
    ".obx-faq{margin-top:40px}",
    ".obx-faq h2{margin:0 0 12px;font-size:1.5em;line-height:1.25}",
    ".obx-faq details{border-bottom:1px solid var(--obx-line)}",
    ".obx-faq summary{display:flex;align-items:center;min-height:48px;padding:10px 0;font-weight:600;cursor:pointer;list-style:none}",
    ".obx-faq summary::-webkit-details-marker{display:none}",
    ".obx-faq summary::after{content:'+';margin-left:auto;padding-left:16px;color:var(--obx-accent);font-size:1.25em;line-height:1}",
    ".obx-faq details[open] summary::after{content:'\\2212'}",
    ".obx-faq summary:focus-visible{outline:2px solid var(--obx-accent);outline-offset:2px}",
    ".obx-faq .obx-faq-a{padding:0 0 16px;line-height:1.7;opacity:.9}",
    ".obx-faq .obx-faq-a p{margin:0}",
    ".obx-faq .obx-faq-a p+p{margin-top:.75em}",
    ".obx-sources{margin-top:32px;font-size:.9em}",
    ".obx-sources h2{margin:0 0 8px;font-size:1em}",
    ".obx-sources ol{margin:0;padding-left:1.4em}",
    ".obx-sources a{color:var(--obx-accent);overflow-wrap:anywhere}",
    ".obx-author{display:flex;flex-direction:column;gap:4px;margin-top:32px;padding-top:20px;border-top:1px solid var(--obx-line)}",
    ".obx-author strong{font-size:1em}",
    ".obx-author span{font-size:.9em;opacity:.75}",
    ".obx-author p{margin:4px 0 0;font-size:.95em;line-height:1.6;opacity:.85}",
    ".obx-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:32px;padding:0;list-style:none}",
    ".obx-tags li{padding:4px 12px;border:1px solid var(--obx-line);border-radius:999px;font-size:.85em}",
    "@media (prefers-reduced-motion:reduce){.obx-card,.obx-skel{transition:none;animation:none}.obx-card:hover{transform:none}}"
  ].join("\n");

  if (!document.getElementById("obx-style")) {
    var style = document.createElement("style");
    style.id = "obx-style";
    style.textContent = CSS_TEXT;
    (document.head || document.documentElement).appendChild(style);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(value) {
    return /^https?:\/\//i.test(String(value || "")) ? esc(value) : "";
  }
  var dateFmt;
  try { dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }); } catch (e) { dateFmt = null; }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return dateFmt ? dateFmt.format(d) : d.toLocaleDateString();
  }

  function withParams(params) {
    var u = new URL(location.href);
    for (var k in params) {
      if (params[k] == null || params[k] === "") u.searchParams.delete(k);
      else u.searchParams.set(k, params[k]);
    }
    return u.pathname + u.search + u.hash;
  }
  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function get(path, query) {
    var qs = "key=" + encodeURIComponent(key);
    for (var k in query) if (query[k] != null && query[k] !== "") qs += "&" + k + "=" + encodeURIComponent(query[k]);
    return fetch(api + path + "?" + qs, { headers: { Accept: "application/json" } }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body && body.error ? body.error : "HTTP " + res.status);
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  // Estado original do <head> para restaurar ao voltar para a lista.
  function metaEl(name) { return document.querySelector('meta[name="' + name + '"]'); }
  function canonicalEl() { return document.querySelector('link[rel="canonical"]'); }
  var original = {
    title: document.title,
    description: metaEl("description") ? metaEl("description").getAttribute("content") : null,
    canonical: canonicalEl() ? canonicalEl().getAttribute("href") : null
  };
  function setMeta(name, value) {
    var el = metaEl(name);
    if (value == null) { if (el && el.hasAttribute("data-obx")) el.parentNode.removeChild(el); else if (el) el.setAttribute("content", original.description || ""); return; }
    if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); el.setAttribute("data-obx", "1"); document.head.appendChild(el); }
    el.setAttribute("content", value);
  }
  function setCanonical(href) {
    var el = canonicalEl();
    if (href == null) { if (el && el.hasAttribute("data-obx")) el.parentNode.removeChild(el); else if (el && original.canonical) el.setAttribute("href", original.canonical); return; }
    if (!el) { el = document.createElement("link"); el.setAttribute("rel", "canonical"); el.setAttribute("data-obx", "1"); document.head.appendChild(el); }
    el.setAttribute("href", href);
  }
  function paragraphs(text) {
    return String(text || "").split(/\n\s*\n|\n/).map(function (t) { return t.trim(); }).filter(Boolean)
      .map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
  }
  // Troca a URL "oficial" do artigo pela página real do embed em todo o @graph (ids, url, breadcrumb).
  function relocateJsonLd(ld, from, to) {
    if (!ld || !from || !to || from === to) return ld;
    try {
      var a = JSON.stringify(from).slice(1, -1);
      var b = JSON.stringify(to).slice(1, -1);
      return JSON.parse(JSON.stringify(ld).split(a).join(b));
    } catch (e) { return ld; }
  }
  function setJsonLd(data) {
    var old = document.getElementById("obx-jsonld");
    if (old) old.parentNode.removeChild(old);
    if (!data) return;
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "obx-jsonld";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }
  function restoreHead() {
    document.title = original.title;
    setMeta("description", null);
    setCanonical(null);
    setJsonLd(null);
  }

  var tracked = {};
  function trackView(slug) {
    if (tracked[slug]) return;
    tracked[slug] = true;
    try {
      fetch(api + "/posts/" + encodeURIComponent(slug) + "/view?key=" + encodeURIComponent(key), { method: "POST", keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  var seq = 0;
  function stateHtml(message, retry) {
    return '<div class="obx-state" role="status"><p>' + esc(message) + "</p>" +
      (retry ? '<button type="button" class="obx-btn" data-obx-retry>Tentar de novo</button>' : "") + "</div>";
  }

  function card(p) {
    var href = esc(withParams({ artigo: p.slug, pagina: null }));
    var cover = p.cover_image && safeUrl(p.cover_image.url)
      ? '<div class="obx-cover"><img src="' + safeUrl(p.cover_image.url) + '" alt="' + esc(p.cover_image.alt || "") + '" loading="lazy" decoding="async"></div>'
      : "";
    var meta = (p.category ? '<span class="obx-cat">' + esc(p.category) + "</span>" : "") +
      (p.published_at ? "<time datetime=\"" + esc(p.published_at) + "\">" + esc(fmtDate(p.published_at)) + "</time>" : "") +
      (p.reading_minutes ? "<span>" + esc(p.reading_minutes) + " min de leitura</span>" : "");
    return '<li><a class="obx-card" data-obx-nav href="' + href + '">' + cover +
      '<div class="obx-body"><div class="obx-meta">' + meta + "</div>" +
      '<h3 class="obx-title">' + esc(p.title) + "</h3>" +
      (p.excerpt ? '<p class="obx-excerpt">' + esc(p.excerpt) + "</p>" : "") +
      '<span class="obx-more" aria-hidden="true">Ler artigo</span></div></a></li>';
  }

  function renderList() {
    var my = ++seq;
    var page = parseInt(param("pagina") || "1", 10);
    if (!(page >= 1)) page = 1;
    restoreHead();
    var skel = "";
    for (var i = 0; i < Math.min(perPage, 3); i++) skel += '<li><div class="obx-skel"></div></li>';
    root.setAttribute("aria-busy", "true");
    root.innerHTML = '<ul class="obx-grid" aria-label="Carregando artigos">' + skel + "</ul>";
    get("/posts", { page: page, per_page: perPage, category: category }).then(function (res) {
      if (my !== seq) return;
      root.removeAttribute("aria-busy");
      var posts = res.data || [];
      if (!posts.length) {
        root.innerHTML = stateHtml(page > 1 ? "Não há artigos nesta página." : "Nenhum artigo publicado ainda.", false);
        return;
      }
      var meta = res.meta || { page: page, total_pages: 1 };
      var html = '<ul class="obx-grid">' + posts.map(card).join("") + "</ul>";
      if (meta.total_pages > 1) {
        var prev = meta.page > 1;
        var next = meta.page < meta.total_pages;
        html += '<nav class="obx-pager" aria-label="Paginação">' +
          '<a class="obx-btn" data-obx-nav rel="prev" aria-disabled="' + !prev + '" href="' + esc(withParams({ pagina: prev ? meta.page - 1 : null, artigo: null })) + '">Anteriores</a>' +
          "<span>Página " + esc(meta.page) + " de " + esc(meta.total_pages) + "</span>" +
          '<a class="obx-btn" data-obx-nav rel="next" aria-disabled="' + !next + '" href="' + esc(withParams({ pagina: next ? meta.page + 1 : meta.page, artigo: null })) + '">Próximos</a>' +
          "</nav>";
      }
      root.innerHTML = html;
    }).catch(function (err) {
      if (my !== seq) return;
      root.removeAttribute("aria-busy");
      root.innerHTML = stateHtml("Não foi possível carregar os artigos. " + (err && err.message ? err.message : ""), true);
    });
  }

  function renderArticle(slug) {
    var my = ++seq;
    root.setAttribute("aria-busy", "true");
    root.innerHTML = '<div class="obx-article"><div class="obx-skel" style="height:420px"></div></div>';
    get("/posts/" + encodeURIComponent(slug), {}).then(function (p) {
      if (my !== seq) return;
      root.removeAttribute("aria-busy");
      var back = '<a class="obx-back" data-obx-nav href="' + esc(withParams({ artigo: null })) + '"><span aria-hidden="true">&larr;</span> Voltar para o blog</a>';
      var metaLine = (p.category ? '<span class="obx-cat">' + esc(p.category) + "</span>" : "") +
        (p.author ? "<span>Por " + esc(p.author) + "</span>" : "") +
        (p.published_at ? '<time datetime="' + esc(p.published_at) + '">' + esc(fmtDate(p.published_at)) + "</time>" : "") +
        (p.reading_minutes ? "<span>" + esc(p.reading_minutes) + " min de leitura</span>" : "");
      var hero = p.cover_image && safeUrl(p.cover_image.url)
        ? '<figure class="obx-hero"><img src="' + safeUrl(p.cover_image.url) + '" alt="' + esc(p.cover_image.alt || "") + '"></figure>'
        : "";
      var answer = p.answer_summary
        ? '<section class="obx-answer" aria-label="Resposta rápida"><span class="obx-label">Resposta rápida</span><p>' + esc(p.answer_summary) + "</p></section>"
        : "";
      var takeaways = p.key_takeaways && p.key_takeaways.length
        ? '<section class="obx-box"><h2>Pontos principais</h2><ul>' + p.key_takeaways.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></section>"
        : "";
      var faq = p.faq && p.faq.length
        ? '<section class="obx-faq"><h2>Perguntas frequentes</h2>' + p.faq.map(function (f) {
            return "<details><summary>" + esc(f.question) + '</summary><div class="obx-faq-a">' + paragraphs(f.answer) + "</div></details>";
          }).join("") + "</section>"
        : "";
      var sources = p.sources && p.sources.length
        ? '<section class="obx-sources"><h2>Fontes</h2><ol>' + p.sources.map(function (s) {
            var title = esc(s.title || s.url) + (s.publisher ? " (" + esc(s.publisher) + ")" : "");
            return "<li>" + (safeUrl(s.url) ? '<a href="' + safeUrl(s.url) + '" target="_blank" rel="noopener">' + title + "</a>" : title) + "</li>";
          }).join("") + "</ol></section>"
        : "";
      var ap = p.author_profile;
      var authorBox = ap && ap.name && (ap.credentials || ap.bio)
        ? '<aside class="obx-author" aria-label="Sobre o autor"><strong>' + esc(ap.name) + "</strong>" +
          (ap.credentials ? "<span>" + esc(ap.credentials) + "</span>" : "") +
          (ap.bio ? "<p>" + esc(ap.bio) + "</p>" : "") + "</aside>"
        : "";
      var tags = p.tags && p.tags.length
        ? '<ul class="obx-tags" aria-label="Tags">' + p.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
        : "";
      // content_html já é sanitizado pelo CMS ao salvar.
      root.innerHTML = '<article class="obx-article">' + back +
        '<div class="obx-meta" style="margin-top:16px">' + metaLine + "</div>" +
        '<h1 class="obx-h1">' + esc(p.title) + "</h1>" +
        (p.excerpt ? '<p class="obx-lead">' + esc(p.excerpt) + "</p>" : "") +
        answer + hero + takeaways + '<div class="obx-content">' + (p.content_html || "") + "</div>" +
        faq + sources + authorBox + tags +
        '<p style="margin-top:40px">' + back + "</p></article>";

      var seo = p.seo || {};
      var here = location.origin + withParams({ artigo: p.slug, pagina: null }).replace(/#.*$/, "");
      // Canonical: outro site quando ele é o dono do conteúdo; senão, esta página.
      var canonical = seo.canonical_url && seo.canonical_url !== p.url ? seo.canonical_url : here;
      document.title = seo.title || p.title;
      setMeta("description", seo.description || p.excerpt || "");
      setCanonical(canonical);
      // JSON-LD em @graph: as URLs do artigo passam a ser as desta página (ou a canônica de outro site).
      var ld = p.json_ld || null;
      if (ld && !ld["@graph"]) {
        ld.url = canonical;
        ld.mainEntityOfPage = { "@type": "WebPage", "@id": canonical };
      } else if (ld) {
        ld = relocateJsonLd(ld, p.url, here);
      }
      setJsonLd(ld);
      trackView(p.slug);
    }).catch(function (err) {
      if (my !== seq) return;
      root.removeAttribute("aria-busy");
      restoreHead();
      var back = '<p><a class="obx-back" data-obx-nav href="' + esc(withParams({ artigo: null })) + '">Voltar para o blog</a></p>';
      root.innerHTML = (err && err.status === 404
        ? stateHtml("Artigo não encontrado.", false)
        : stateHtml("Não foi possível carregar o artigo. " + (err && err.message ? err.message : ""), true)) + back;
    });
  }

  function route() {
    var slug = param("artigo");
    if (slug) renderArticle(slug);
    else renderList();
  }

  root.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-obx-retry]")) { route(); return; }
    var a = e.target.closest ? e.target.closest("a[data-obx-nav]") : null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!window.history || !history.pushState) return;
    e.preventDefault();
    history.pushState({ obx: true }, "", a.getAttribute("href"));
    route();
    var top = root.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight) root.scrollIntoView({ block: "start" });
  });
  window.addEventListener("popstate", route);

  if (!key) {
    root.innerHTML = stateHtml("Blog não configurado: falta o atributo data-key no script do OutBox.", false);
    return;
  }
  route();
})();
`;

// Só ASCII: o script funciona mesmo em páginas servidas com outro charset.
const BODY = SCRIPT.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
