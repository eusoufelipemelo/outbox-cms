"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { Archive, ArchiveRestore, CalendarClock, CalendarX, ImagePlus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { MediaPicker } from "@/components/media/media-picker";
import { callAi } from "@/lib/ai/client";
import type { AiOutput } from "@/lib/ai/types";
import {
  archivePost,
  cancelSchedule,
  deletePost,
  publishArticle,
  removeDestination,
  restoreRevision,
  savePost,
  schedulePost,
  unarchivePost,
  unpublishFromSite,
} from "@/lib/data/post-actions";
import { FAQ_MAX, TAKEAWAYS_MAX, geoReport, isCompleteFaq, isHttpUrl } from "@/lib/geo";
import { seoReport } from "@/lib/seo";
import type { ContentType, FaqItem, PostStatus } from "@/lib/types";
import { countWords, hostname, readingMinutes, slugify, stripHtml } from "@/lib/utils";
import { AiAssistant } from "./ai-assistant";
import { localInputToIso, isoToLocalInput } from "./datetime";
import { DeliveryPanel, type DeliveryState } from "./delivery-panel";
import { DestinationsSection, hasVariation } from "./destinations-section";
import { DetailsSection } from "./details-section";
import { articleExtensions } from "./extensions";
import { HistorySection } from "./history-section";
import { RailSection, useConfirm, type MenuItem } from "./primitives";
import { SeoSection } from "./seo-section";
import { FullArticleDialog, type FullArticleRequest } from "./full-article-dialog";
import { AnswerBlock, FaqBlock, SOURCES_MAX, SourcesBlock, TakeawaysBlock, normalizeSourceUrl } from "./geo-blocks";
import { GeoSection, type ExpertSuggestion } from "./geo-section";
import { EditorToolbar } from "./toolbar";
import { ScheduleDialog, TopBar, useIsNarrow, type PublishTarget, type SaveState } from "./top-bar";
import type {
  DestinationDraft,
  DestinationSite,
  EditorPost,
  Publication,
  RevisionItem,
  SaveOutcome,
  SavePostInput,
  SourceDraft,
} from "./types";
import { VariationsSection } from "./variations-section";

const AUTOSAVE_MS = 1500;

interface Draft {
  title: string;
  slug: string;
  slugTouched: boolean;
  excerpt: string;
  contentHtml: string;
  contentJson: unknown;
  coverUrl: string;
  coverAlt: string;
  category: string;
  tags: string[];
  authorName: string;
  seoTitle: string;
  seoDescription: string;
  focusKeyword: string;
  answerSummary: string;
  keyTakeaways: string[];
  faq: FaqItem[];
  sources: SourceDraft[];
  contentType: ContentType;
  scheduledLocal: string;
  destinations: DestinationDraft[];
}

type Patch = Partial<Draft> | ((d: Draft) => Partial<Draft>);

function initialDraft(
  post: EditorPost | null,
  scheduledLocal: string,
  siteIds: string[] = [],
  contentType: ContentType = "article",
): Draft {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    slugTouched: Boolean(post && post.slug && post.slug !== slugify(post.title)),
    excerpt: post?.excerpt ?? "",
    contentHtml: post?.contentHtml ?? "",
    contentJson: undefined,
    coverUrl: post?.coverImageUrl ?? "",
    coverAlt: post?.coverImageAlt ?? "",
    category: post?.category ?? "",
    tags: post?.tags ?? [],
    authorName: post?.authorName ?? "",
    seoTitle: post?.seoTitle ?? "",
    seoDescription: post?.seoDescription ?? "",
    focusKeyword: post?.focusKeyword ?? "",
    answerSummary: post?.answerSummary ?? "",
    keyTakeaways: post?.keyTakeaways ?? [],
    faq: post?.faq ?? [],
    sources: post?.sources ?? [],
    contentType: post?.contentType ?? contentType,
    scheduledLocal: post ? isoToLocalInput(post.scheduledAt) : scheduledLocal,
    destinations: post?.destinations ?? siteIds.map(emptyDestination),
  };
}

function hasContent(d: Draft) {
  return Boolean(d.title.trim() || stripHtml(d.contentHtml));
}

// Itens incompletos continuam na tela, mas só vão ao servidor quando estiverem completos
// (o autosave não pode falhar enquanto a pessoa ainda está digitando uma pergunta ou colando um link).
const completeFaq = (items: FaqItem[]) =>
  items
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter(isCompleteFaq)
    .slice(0, FAQ_MAX);

function completeSources(items: SourceDraft[]): SourceDraft[] {
  return items
    .map((s) => ({ title: s.title.trim(), url: normalizeSourceUrl(s.url), publisher: s.publisher.trim() }))
    .filter((s) => isHttpUrl(s.url))
    .map((s) => ({ ...s, title: s.title || hostname(s.url) }))
    .slice(0, SOURCES_MAX);
}

function toPayload(d: Draft, id: string | null): SavePostInput {
  return {
    id,
    title: d.title,
    slug: d.slug,
    excerpt: d.excerpt,
    contentHtml: d.contentHtml,
    contentJson: d.contentJson,
    coverImageUrl: d.coverUrl,
    coverImageAlt: d.coverAlt,
    category: d.category,
    tags: d.tags,
    authorName: d.authorName,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    focusKeyword: d.focusKeyword,
    answerSummary: d.answerSummary,
    keyTakeaways: d.keyTakeaways
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, TAKEAWAYS_MAX),
    faq: completeFaq(d.faq),
    sources: completeSources(d.sources),
    contentType: d.contentType,
    scheduledAt: d.scheduledLocal ? localInputToIso(d.scheduledLocal) : null,
    sites: d.destinations.map((x) => ({ ...x, overrideFaq: completeFaq(x.overrideFaq) })),
  };
}

const emptyDestination = (siteId: string): DestinationDraft => ({
  siteId,
  isCanonical: false,
  overrideTitle: "",
  overrideExcerpt: "",
  overrideContentHtml: "",
  overrideSeoTitle: "",
  overrideSeoDescription: "",
  overrideAnswerSummary: "",
  overrideFaq: [],
});

const OFFLINE = "Sem conexão com o servidor. Suas alterações continuam aqui; salvaremos assim que der.";

function TitleInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label="Título do artigo"
      placeholder="Título do artigo"
      className="display block w-full resize-none overflow-hidden bg-transparent text-[clamp(2rem,4.2vw,3rem)] placeholder:text-faint focus:outline-none"
    />
  );
}

function CoverImage({
  url,
  alt,
  onPick,
  onRemove,
  onAltChange,
}: {
  url: string;
  alt: string;
  onPick: () => void;
  onRemove: () => void;
  onAltChange: (alt: string) => void;
}) {
  if (!url) {
    return (
      <div className="px-5 pt-6 sm:px-10 lg:px-14">
        <div className="mx-auto max-w-[720px]">
          <Button variant="ghost" onClick={onPick} className="-ml-3">
            <ImagePlus className="size-4" aria-hidden />
            Adicionar imagem de capa
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="border-b border-line">
      <div className="group relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagens vêm de hosts variados (mídia, IA, sites) */}
        <img src={url} alt={alt} className="aspect-[2/1] w-full rounded-t-[var(--radius-panel)] bg-sunken object-cover" />
        <div className="absolute top-3 right-3 flex gap-2">
          <Button variant="secondary" size="md" onClick={onPick}>
            Trocar capa
          </Button>
          <Button variant="secondary" size="icon" onClick={onRemove} aria-label="Remover capa">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 sm:px-10 lg:px-14">
        <label htmlFor="cover-alt" className="text-[13px] font-medium text-ink">
          Texto alternativo da capa
        </label>
        <Input
          id="cover-alt"
          value={alt}
          onChange={(e) => onAltChange(e.target.value)}
          placeholder="Descreva o que a imagem mostra"
          className="h-10 min-w-0 flex-1 basis-56"
          aria-invalid={!alt.trim() || undefined}
        />
      </div>
    </div>
  );
}

export function ArticleEditor({
  post,
  sites,
  categories,
  initialScheduledLocal = "",
  initialSiteIds = [],
  clients,
  initialClientId = "",
  initialAi,
}: {
  post: EditorPost | null;
  sites: DestinationSite[];
  categories: string[];
  initialScheduledLocal?: string;
  /** Destinos pré-marcados em um artigo novo (ex.: /artigos/novo?cliente=<id>). */
  initialSiteIds?: string[];
  /** Clientes para o "Criar artigo completo com IA" (padrão: os clientes dos sites). */
  clients?: { id: string; name: string }[];
  /** Cliente pré-escolhido (ex.: ?cliente=<id>), mesmo sem site ativo. */
  initialClientId?: string;
  /** Abre o "Criar artigo completo com IA" já preenchido (ex.: /artigos/novo?tema=…&palavra=…, vindo de Pautas). */
  initialAi?: { open: boolean; topic: string; keyword: string; contentType?: ContentType };
}) {
  const router = useRouter();
  const narrow = useIsNarrow();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(post, initialScheduledLocal, initialSiteIds, initialAi?.contentType),
  );
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "draft");
  const [serverScheduledAt, setServerScheduledAt] = useState<string | null>(post?.scheduledAt ?? null);
  const [publications, setPublications] = useState<Publication[]>(post?.publications ?? []);
  const [revisions, setRevisions] = useState<RevisionItem[]>(post?.revisions ?? []);
  const [saveState, setSaveState] = useState<SaveState>(post ? "saved" : "new");
  const [savedAt, setSavedAt] = useState<string | null>(post?.updatedAt ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [picker, setPicker] = useState<null | "cover" | "inline">(null);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [busySiteId, setBusySiteId] = useState<string | null>(null);
  const [generatingSiteId, setGeneratingSiteId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [fullArticleOpen, setFullArticleOpen] = useState(Boolean(initialAi?.open));
  // o que a IA sugeriu citar (não é salvo: some ao recarregar ou ao dispensar)
  const [sourceSuggestions, setSourceSuggestions] = useState<string[]>([]);
  // referência de "agora" para a checagem de atualização (fixa por sessão do editor)
  const [openedAt] = useState(() => Date.now());

  // refs lidos só em callbacks (autosave, atalhos, beforeunload)
  const draftRef = useRef(draft);
  const postIdRef = useRef(postId);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastErrorRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  const statusRef = useRef(status);

  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const update = useCallback((patch: Patch) => {
    versionRef.current += 1;
    setDraft((d) => {
      const p = typeof patch === "function" ? patch(d) : patch;
      const next = { ...d, ...p };
      // slug acompanha o título até ser editado à mão (e nunca muda sozinho depois de publicado)
      if (p.title !== undefined && !next.slugTouched && statusRef.current !== "published") next.slug = slugify(next.title);
      return next;
    });
    setSaveState("dirty");
  }, []);

  /** Aplica o que o servidor devolveu depois de gravar a versão `version`. */
  const applySaved = useCallback((data: SaveOutcome, version: number) => {
    if (!postIdRef.current) {
      postIdRef.current = data.id;
      setPostId(data.id);
      // troca a URL sem remontar o editor (o foco e o cursor ficam onde estão)
      window.history.replaceState(null, "", `/artigos/${data.id}`);
    }
    savedVersionRef.current = Math.max(savedVersionRef.current, version);
    setSavedAt(data.savedAt);
    setPublications(data.publications);
    setStatus(data.status);
    setSaveError(null);
    lastErrorRef.current = null;
    if (data.revision) setRevisions((r) => [data.revision!, ...r.filter((x) => x.id !== data.revision!.id)]);
    setSaveState(versionRef.current === version ? "saved" : "dirty");
  }, []);

  /** Enfileira operações que gravam o artigo, para nunca rodarem em paralelo (nem criarem dois rascunhos). */
  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(fn, fn);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const save = useCallback((): Promise<string | null> => {
    return enqueue(async () => {
      const currentId = postIdRef.current;
      if (currentId && versionRef.current === savedVersionRef.current) return currentId;
      const d = draftRef.current;
      if (!currentId && !hasContent(d)) {
        setSaveState("new");
        return null;
      }
      const version = versionRef.current;
      setSaveState("saving");
      const res = await savePost(toPayload(d, currentId)).catch(() => ({ ok: false as const, error: OFFLINE }));
      if (!res.ok) {
        lastErrorRef.current = res.error;
        setSaveError(res.error);
        setSaveState("error");
        return null;
      }
      applySaved(res.data!, version);
      return res.data!.id;
    });
  }, [enqueue, applySaved]);

  // ---- editor ----
  const editor = useEditor({
    immediatelyRender: false,
    extensions: articleExtensions("Comece a escrever o artigo…"),
    content: post?.contentHtml ?? "",
    editorProps: {
      attributes: {
        class: "prose-article tiptap min-h-[45vh]",
        "aria-label": "Texto do artigo",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => update({ contentHtml: e.isEmpty ? "" : e.getHTML(), contentJson: e.getJSON() }),
  });

  // ---- autosave com debounce ----
  useEffect(() => {
    if (saveState !== "dirty") return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, saveState, save]);

  // ---- Cmd/Ctrl+S ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save().then((id) => {
          if (id) toast.success("Artigo salvo");
          else if (lastErrorRef.current) toast.error(lastErrorRef.current);
          else toast.message("Escreva um título ou algum texto para salvar.");
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // ---- aviso ao sair com alterações não salvas ----
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      const dirty = versionRef.current !== savedVersionRef.current && (postIdRef.current || hasContent(draftRef.current));
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // ---- assistente disponível? ----
  useEffect(() => {
    let alive = true;
    fetch("/api/ai", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((body: { enabled?: boolean }) => alive && setAiEnabled(Boolean(body.enabled)))
      .catch(() => alive && setAiEnabled(false));
    return () => {
      alive = false;
    };
  }, []);

  // ---- derivados ----
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const deferred = useDeferredValue(draft);
  const report = useMemo(
    () =>
      seoReport({
        title: deferred.title,
        seoTitle: deferred.seoTitle,
        seoDescription: deferred.seoDescription,
        excerpt: deferred.excerpt,
        slug: deferred.slug,
        focusKeyword: deferred.focusKeyword,
        html: deferred.contentHtml,
        coverImageUrl: deferred.coverUrl,
        coverImageAlt: deferred.coverAlt,
        answerSummary: deferred.answerSummary,
      }),
    [deferred],
  );
  const words = useMemo(() => countWords(deferred.contentHtml), [deferred.contentHtml]);
  const pubBySite = useMemo(() => new Map(publications.map((p) => [p.siteId, p])), [publications]);
  const canonicalDest = draft.destinations.find((d) => d.isCanonical);
  const primarySite = siteById.get(canonicalDest?.siteId ?? draft.destinations[0]?.siteId ?? "") ?? null;
  const primaryClientId = primarySite?.client.id;

  // clientes dos destinos (o original primeiro): entidades da resposta direta e especialista sugerido
  const destClients = useMemo(() => {
    const ordered = [...deferred.destinations].sort((a, b) => Number(b.isCanonical) - Number(a.isCanonical));
    const seen = new Map<string, DestinationSite["client"]>();
    for (const d of ordered) {
      const c = siteById.get(d.siteId)?.client;
      if (c && !seen.has(c.id)) seen.set(c.id, c);
    }
    return [...seen.values()];
  }, [deferred.destinations, siteById]);
  const expert: ExpertSuggestion | null = useMemo(() => {
    const c = destClients.find((x) => x.expert_name?.trim());
    return c ? { name: c.expert_name!.trim(), credentials: c.expert_credentials?.trim() || null, clientName: c.name } : null;
  }, [destClients]);
  // versão no ar mais antiga entre os sites (é ela que precisa de atualização)
  const oldestLive = useMemo(() => {
    const times = publications
      .filter((p) => p.status === "published" && p.snapshotAt)
      .map((p) => p.snapshotAt as string)
      .sort();
    return times[0] ?? null;
  }, [publications]);
  const geo = useMemo(
    () =>
      geoReport({
        answerSummary: deferred.answerSummary,
        focusKeyword: deferred.focusKeyword,
        entities: destClients.flatMap((c) => [c.name, c.city ?? ""]),
        html: deferred.contentHtml,
        keyTakeaways: deferred.keyTakeaways,
        faq: deferred.faq,
        sources: deferred.sources.map((x) => ({ url: normalizeSourceUrl(x.url) })),
        authorName: deferred.authorName,
        expert,
        liveVersionAt: oldestLive,
        now: openedAt,
      }),
    [deferred, destClients, expert, oldestLive, openedAt],
  );
  const clientOptions = useMemo(() => {
    if (clients) return clients;
    const map = new Map<string, string>();
    for (const s of sites) if (s.client.id) map.set(s.client.id, s.client.name);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [clients, sites]);
  const targets: PublishTarget[] = draft.destinations
    .map((d) => {
      const s = siteById.get(d.siteId);
      if (!s) return null;
      return {
        siteId: s.id,
        name: s.name,
        host: hostname(s.url),
        color: s.client.brand_color,
        canonical: d.isCanonical,
        live: pubBySite.get(s.id)?.status === "published",
      };
    })
    .filter((t): t is PublishTarget => t !== null);
  // Artigo no ar com texto mais novo que a versão enviada a algum site (posts.updated_at > snapshot_at).
  const livePubs = publications.filter((p) => p.status === "published");
  const savedMs = savedAt ? Date.parse(savedAt) : 0;
  const unsent =
    status === "published" &&
    livePubs.length > 0 &&
    (saveState === "dirty" ||
      saveState === "saving" ||
      saveState === "error" ||
      livePubs.some((p) => !p.snapshotAt || savedMs > Date.parse(p.snapshotAt)));

  // ---- ações ----
  const leaveTo = async (href: string) => {
    if (versionRef.current !== savedVersionRef.current && (postIdRef.current || hasContent(draftRef.current))) {
      const id = await save();
      if (!id && lastErrorRef.current) {
        const go = await confirm({
          title: "Sair sem salvar?",
          description: `${lastErrorRef.current} Se sair agora, as últimas alterações se perdem.`,
          confirmLabel: "Sair sem salvar",
          tone: "danger",
        });
        if (!go) return;
      }
    }
    leavingRef.current = true;
    router.push(href);
  };

  const onBack = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    void leaveTo("/artigos");
  };

  const onPreview = async () => {
    const win = window.open("about:blank", "_blank");
    const id = await save();
    if (!id) {
      win?.close();
      toast.error(lastErrorRef.current ?? "Escreva um título ou algum texto antes de pré-visualizar.");
      return;
    }
    const url = `/artigos/${id}/preview`;
    if (win) win.location.href = url;
    else router.push(url);
  };

  const runPublish = (onlySiteIds?: string[]) => {
    const d = draftRef.current;
    if (!d.title.trim()) {
      toast.error("Dê um título ao artigo antes de publicar.");
      return;
    }
    const siteIds = onlySiteIds ?? d.destinations.map((x) => x.siteId);
    if (!siteIds.length) return;
    const allLive = siteIds.every((id) => pubBySite.get(id)?.status === "published");
    const round = Date.now();
    setDelivery({ round, siteIds, event: allLive ? "update" : "publish", results: null, error: null });
    setPublishing(true);
    void enqueue(async () => {
      const version = versionRef.current;
      const res = await publishArticle(toPayload(draftRef.current, postIdRef.current), onlySiteIds).catch(() => ({
        ok: false as const,
        error: "Sem conexão com o servidor. Nada foi publicado. Confira a internet e tente de novo.",
      }));
      setPublishing(false);
      if (!res.ok) {
        setDelivery((cur) => (cur && cur.round === round ? { ...cur, error: res.error } : cur));
        toast.error(res.error);
        return;
      }
      const out = res.data!;
      applySaved(out, version);
      setStatus(out.status);
      if (out.status === "published") {
        setServerScheduledAt(null);
        setDraft((cur) => ({ ...cur, scheduledLocal: "" }));
      }
      setDelivery((cur) => (cur && cur.round === round ? { ...cur, event: out.event, results: out.results } : cur));
      const ok = out.results.filter((r) => r.ok).length;
      const total = out.results.length;
      const verb = out.event === "update" ? "Atualizado" : "Publicado";
      const word = total === 1 ? "site" : "sites";
      if (ok === total) toast.success(`${verb} em ${ok} de ${total} ${word}`);
      else if (ok > 0) toast.warning(`${verb} em ${ok} de ${total} ${word}. Veja o que falhou.`);
      else toast.error(`Não foi possível publicar em nenhum dos ${total} ${word}.`);
    });
  };

  const runSchedule = () => {
    const iso = localInputToIso(draftRef.current.scheduledLocal);
    if (!iso) {
      toast.error("Escolha a data e o horário da publicação.");
      return;
    }
    setScheduling(true);
    void enqueue(async () => {
      const version = versionRef.current;
      const res = await schedulePost(toPayload(draftRef.current, postIdRef.current)).catch(() => ({ ok: false as const, error: OFFLINE }));
      setScheduling(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      applySaved(res.data!, version);
      setServerScheduledAt(iso);
      setScheduleOpen(false);
      toast.success(`Publicação agendada para ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(iso))}`);
    });
  };

  const runCancelSchedule = async () => {
    const id = postIdRef.current;
    if (!id) return;
    setScheduling(true);
    const res = await cancelSchedule(id).catch(() => ({ ok: false as const, error: OFFLINE }));
    setScheduling(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setStatus("draft");
    setServerScheduledAt(null);
    setScheduleOpen(false);
    toast.success("Agendamento cancelado. O artigo voltou para rascunho.");
  };

  const takeOffSite = async (siteId: string, removing: boolean) => {
    const site = siteById.get(siteId);
    const id = postIdRef.current;
    if (!site || !id) return false;
    const ok = await confirm({
      title: `Tirar o artigo do ar em ${site.name}?`,
      description: removing
        ? "Para remover este destino, o artigo sai do ar nesse site. Os outros sites não mudam."
        : "O artigo sai do ar nesse site e fica na lista como despublicado. Marque o site de novo para publicar outra vez. Os outros sites não mudam.",
      confirmLabel: "Despublicar",
      tone: "danger",
    });
    if (!ok) return false;
    setBusySiteId(siteId);
    // na fila de gravação: um autosave em andamento não recria o destino depois da remoção
    const res = await enqueue(() =>
      (removing ? removeDestination(id, siteId) : unpublishFromSite(id, siteId)).catch(() => ({ ok: false as const, error: OFFLINE })),
    );
    setBusySiteId(null);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setPublications(res.data!.publications);
    update((d) => ({ destinations: d.destinations.filter((x) => x.siteId !== siteId) }));
    toast.success(`Despublicado de ${hostname(site.url)}`);
    return true;
  };

  /** Tira da lista um destino já despublicado (apaga o selo e o histórico daquele site). */
  const removeSite = async (siteId: string) => {
    const site = siteById.get(siteId);
    const id = postIdRef.current;
    if (!id) return;
    setBusySiteId(siteId);
    const res = await enqueue(() => removeDestination(id, siteId).catch(() => ({ ok: false as const, error: OFFLINE })));
    setBusySiteId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPublications(res.data!.publications);
    toast.success(`Destino removido: ${site ? hostname(site.url) : "site"}`);
  };

  const toggleSite = (siteId: string) => {
    const selected = draft.destinations.some((d) => d.siteId === siteId);
    if (!selected) {
      update((d) => ({ destinations: [...d.destinations, emptyDestination(siteId)] }));
      return;
    }
    if (pubBySite.get(siteId)?.status === "published") {
      void takeOffSite(siteId, true);
      return;
    }
    update((d) => ({ destinations: d.destinations.filter((x) => x.siteId !== siteId) }));
  };

  const setCanonical = (siteId: string) =>
    update((d) => ({
      destinations: d.destinations.map((x) => ({ ...x, isCanonical: x.siteId === siteId ? !x.isCanonical : false })),
    }));

  const patchDestination = (siteId: string, patch: Partial<DestinationDraft>) =>
    update((d) => ({ destinations: d.destinations.map((x) => (x.siteId === siteId ? { ...x, ...patch } : x)) }));

  const generateVariation = async (siteId: string) => {
    setGeneratingSiteId(siteId);
    try {
      const id = await save();
      if (!id) {
        toast.error(lastErrorRef.current ?? "Escreva o artigo antes de gerar variações.");
        return;
      }
      const out = await callAi("variation", { postId: id, siteId });
      patchDestination(siteId, {
        overrideTitle: out.title ?? "",
        overrideExcerpt: out.excerpt ?? "",
        overrideContentHtml: out.content_html ?? "",
        overrideSeoTitle: out.seo_title ?? "",
        overrideSeoDescription: out.seo_description ?? "",
        overrideAnswerSummary: out.answer_summary ?? "",
        overrideFaq: Array.isArray(out.faq) ? out.faq.filter(isCompleteFaq).slice(0, FAQ_MAX) : [],
      });
      toast.success(`Variação gerada para ${siteById.get(siteId)?.name ?? "o site"}. Revise antes de publicar.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "O assistente não respondeu. Tente de novo.");
    } finally {
      setGeneratingSiteId(null);
    }
  };

  const onRestore = async (rev: RevisionItem) => {
    const id = postIdRef.current;
    if (!id) return;
    const ok = await confirm({
      title: "Restaurar esta versão?",
      description: "O título, o texto e o SEO voltam para essa versão. O texto atual fica guardado no histórico.",
      confirmLabel: "Restaurar versão",
    });
    if (!ok) return;
    setRestoringId(rev.id);
    await save(); // o texto atual (com as últimas edições) vai para o histórico antes de trocar
    const res = await enqueue(() => restoreRevision(id, rev.id).catch(() => ({ ok: false as const, error: OFFLINE })));
    setRestoringId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const r = res.data!;
    editor?.commands.setContent(r.contentHtml, { emitUpdate: false });
    versionRef.current += 1;
    savedVersionRef.current = versionRef.current;
    setDraft((d) => ({
      ...d,
      title: r.title,
      contentHtml: r.contentHtml,
      contentJson: editor?.getJSON(),
      seoTitle: r.seoTitle,
      seoDescription: r.seoDescription,
    }));
    setRevisions(r.revisions);
    setSavedAt(r.savedAt);
    setSaveState("saved");
    toast.success("Versão restaurada");
  };

  const onArchive = async () => {
    const id = postIdRef.current;
    if (!id) return;
    const live = publications.some((p) => p.status === "published");
    const ok = await confirm({
      title: "Arquivar artigo?",
      description: live
        ? "O artigo sai do ar em todos os sites e some da lista principal. Você pode restaurá-lo depois."
        : "O artigo some da lista principal. Você pode restaurá-lo depois.",
      confirmLabel: "Arquivar artigo",
    });
    if (!ok) return;
    await save();
    const res = await archivePost(id).catch(() => ({ ok: false as const, error: OFFLINE }));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setStatus("archived");
    setServerScheduledAt(null);
    setSavedAt(res.data!.savedAt);
    toast.success("Artigo arquivado");
  };

  const onUnarchive = async () => {
    const id = postIdRef.current;
    if (!id) return;
    const res = await unarchivePost(id).catch(() => ({ ok: false as const, error: OFFLINE }));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setStatus("draft");
    setSavedAt(res.data!.savedAt);
    toast.success("Artigo restaurado do arquivo");
  };

  const onDelete = async () => {
    const id = postIdRef.current;
    if (!id) return;
    const ok = await confirm({
      title: "Excluir artigo?",
      description: "O artigo, as publicações e o histórico são apagados de vez. Se estiver no ar, ele sai dos sites antes.",
      confirmLabel: "Excluir artigo",
      tone: "danger",
    });
    if (!ok) return;
    let res = await deletePost(id).catch(() => ({ ok: false as const, error: OFFLINE }));
    if (!res.ok && "fieldErrors" in res && res.fieldErrors?.force) {
      const force = await confirm({
        title: "Excluir mesmo assim?",
        description: res.error,
        confirmLabel: "Excluir mesmo assim",
        tone: "danger",
      });
      if (!force) return;
      res = await deletePost(id, { force: true }).catch(() => ({ ok: false as const, error: OFFLINE }));
    }
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    leavingRef.current = true;
    toast.success("Artigo excluído");
    router.push("/artigos");
  };

  const onDiscard = async () => {
    const ok = !hasContent(draftRef.current)
      ? true
      : await confirm({
          title: "Descartar rascunho?",
          description: "O texto ainda não foi salvo e será perdido.",
          confirmLabel: "Descartar",
          tone: "danger",
        });
    if (!ok) return;
    leavingRef.current = true;
    router.push("/artigos");
  };

  const applySeo = (seo: AiOutput["seo"]) =>
    update((d) => ({
      seoTitle: seo.seo_title || d.seoTitle,
      seoDescription: seo.seo_description || d.seoDescription,
      excerpt: d.excerpt.trim() ? d.excerpt : seo.excerpt || d.excerpt,
      ...(status !== "published" && seo.slug ? { slug: slugify(seo.slug), slugTouched: true } : {}),
    }));

  /** Blocos de GEO vindos do assistente. Pergunta antes de trocar o que já foi escrito. */
  const applyGeo = async (out: AiOutput["geo"]) => {
    const d = draftRef.current;
    const filled = [
      d.answerSummary.trim() ? "a resposta direta" : null,
      d.keyTakeaways.some((t) => t.trim()) ? "os pontos principais" : null,
      d.faq.some((f) => f.question.trim() || f.answer.trim()) ? "as perguntas frequentes" : null,
    ].filter(Boolean) as string[];
    if (filled.length) {
      const list = filled.length === 1 ? filled[0] : `${filled.slice(0, -1).join(", ")} e ${filled[filled.length - 1]}`;
      const ok = await confirm({
        title: "Substituir os blocos de GEO?",
        description: `A IA vai substituir ${list} que você já escreveu.`,
        confirmLabel: "Substituir blocos",
      });
      if (!ok) return;
    }
    const faq = (out.faq ?? []).filter(isCompleteFaq).slice(0, FAQ_MAX);
    const takeaways = (out.key_takeaways ?? []).map((t) => t.trim()).filter(Boolean).slice(0, TAKEAWAYS_MAX);
    update((cur) => ({
      answerSummary: out.answer_summary?.trim() || cur.answerSummary,
      keyTakeaways: takeaways.length ? takeaways : cur.keyTakeaways,
      faq: faq.length ? faq : cur.faq,
      ...(out.content_type ? { contentType: out.content_type } : {}),
    }));
    toast.success("Blocos de GEO gerados. Revise antes de publicar.");
  };

  /** Artigo completo vindo do assistente. Devolve false se a pessoa desistiu de substituir. */
  const applyFullArticle = async (out: AiOutput["full_article"], req: FullArticleRequest): Promise<boolean> => {
    const d = draftRef.current;
    if (hasContent(d) || d.answerSummary.trim()) {
      const ok = await confirm({
        title: "Substituir o artigo atual?",
        description: "Título, texto, resposta direta, pontos principais, perguntas frequentes e SEO serão trocados pelo que a IA escreveu.",
        confirmLabel: "Substituir artigo",
      });
      if (!ok) return false;
    }
    const published = statusRef.current === "published";
    if (editor) editor.commands.setContent(out.content_html ?? "", { emitUpdate: false });
    const faq = (out.faq ?? []).filter(isCompleteFaq).slice(0, FAQ_MAX);
    const takeaways = (out.key_takeaways ?? []).map((t) => t.trim()).filter(Boolean).slice(0, TAKEAWAYS_MAX);
    update((cur) => {
      const title = out.title?.trim() || cur.title;
      const slug = out.slug ? slugify(out.slug) : slugify(title);
      // escolheu um cliente e ainda não há destino: marca os sites ativos dele
      const clientSites =
        req.clientId && cur.destinations.length === 0
          ? sites.filter((s) => s.client.id === req.clientId && s.status === "active").map((s) => emptyDestination(s.id))
          : [];
      return {
        title,
        ...(published ? {} : { slug, slugTouched: Boolean(out.slug) }),
        excerpt: out.excerpt?.trim() || cur.excerpt,
        contentHtml: editor ? (editor.isEmpty ? "" : editor.getHTML()) : (out.content_html ?? ""),
        contentJson: editor?.getJSON(),
        answerSummary: out.answer_summary?.trim() || cur.answerSummary,
        keyTakeaways: takeaways.length ? takeaways : cur.keyTakeaways,
        faq: faq.length ? faq : cur.faq,
        seoTitle: out.seo_title?.trim() || cur.seoTitle,
        seoDescription: out.seo_description?.trim() || cur.seoDescription,
        focusKeyword: out.focus_keyword?.trim() || req.keyword || cur.focusKeyword,
        contentType: out.content_type || req.contentType,
        ...(clientSites.length ? { destinations: clientSites } : {}),
      };
    });
    setSourceSuggestions((out.source_suggestions ?? []).map((x) => x.trim()).filter(Boolean));
    toast.success("Artigo criado. Revise o texto, confira as fontes e publique.");
    return true;
  };

  const scheduleItem: MenuItem[] =
    narrow && status !== "published"
      ? [
          {
            key: "schedule",
            label: status === "scheduled" ? "Alterar agendamento" : "Agendar publicação",
            icon: <CalendarClock aria-hidden />,
            onSelect: () => setScheduleOpen(true),
          },
        ]
      : [];
  const unscheduleItem: MenuItem[] =
    status === "scheduled"
      ? [{ key: "unschedule", label: "Cancelar agendamento", icon: <CalendarX aria-hidden />, onSelect: () => void runCancelSchedule() }]
      : [];
  const lifecycleItems: MenuItem[] = postId
    ? [
        status === "archived"
          ? { key: "unarchive", label: "Restaurar do arquivo", icon: <ArchiveRestore aria-hidden />, onSelect: () => void onUnarchive() }
          : { key: "archive", label: "Arquivar", icon: <Archive aria-hidden />, onSelect: () => void onArchive() },
        { key: "delete", label: "Excluir artigo", icon: <Trash2 aria-hidden />, onSelect: () => void onDelete(), danger: true },
      ]
    : [{ key: "discard", label: "Descartar rascunho", icon: <Trash2 aria-hidden />, onSelect: () => void onDiscard(), danger: true }];
  const menuItems = [...scheduleItem, ...unscheduleItem, ...lifecycleItems];

  const variationCount = draft.destinations.filter(hasVariation).length;

  return (
    <div className="-mx-4 -mt-8 sm:-mx-6 lg:-mx-10 lg:-mt-10">
      <TopBar
        saveState={saveState}
        savedAt={savedAt}
        saveError={saveError}
        onRetrySave={() => void save()}
        status={status}
        scheduledAt={serverScheduledAt}
        onBack={onBack}
        onPreview={onPreview}
        targets={targets}
        unsent={unsent}
        publishing={publishing}
        onPublish={() => runPublish()}
        onOpenSchedule={() => setScheduleOpen(true)}
        menuItems={menuItems}
        scores={{ seo: { score: report.score, total: report.total }, geo: { score: geo.score, total: geo.total } }}
      />

      {status === "archived" ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-warn-soft px-4 py-2.5 text-sm text-warn sm:px-6 lg:px-10">
          <span className="flex-1">Este artigo está arquivado e não aparece na lista principal.</span>
          <Button variant="secondary" size="sm" className="h-10" onClick={onUnarchive}>
            Restaurar do arquivo
          </Button>
        </div>
      ) : null}

      <div className="grid items-start gap-6 px-4 pt-6 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:px-10">
        <article className="min-w-0 rounded-[var(--radius-panel)] border border-line bg-surface" aria-label="Artigo">
          {!postId && !hasContent(draft) && aiEnabled !== false ? (
            <div className="border-b border-line px-5 py-5 sm:px-10 lg:px-14">
              <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-x-5 gap-y-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-sunken text-ink">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-[15px] font-semibold text-ink">Criar artigo completo com IA</p>
                  <p className="text-[13px] leading-snug text-muted">
                    Dê o tema e receba texto, resposta direta, perguntas frequentes e SEO prontos para revisar.
                  </p>
                </div>
                <Button onClick={() => setFullArticleOpen(true)} disabled={aiEnabled !== true} className="max-sm:w-full max-sm:justify-center">
                  Criar com IA
                </Button>
              </div>
            </div>
          ) : null}
          <CoverImage
            url={draft.coverUrl}
            alt={draft.coverAlt}
            onPick={() => setPicker("cover")}
            onRemove={() => update({ coverUrl: "", coverAlt: "" })}
            onAltChange={(coverAlt) => update({ coverAlt })}
          />
          <div className="px-5 pt-6 pb-4 sm:px-10 lg:px-14">
            <div className="mx-auto max-w-[720px]">
              <TitleInput
                value={draft.title}
                onChange={(title) => update({ title })}
                onEnter={() => document.getElementById("geo-answer")?.focus()}
              />
            </div>
          </div>

          <AnswerBlock
            value={draft.answerSummary}
            onChange={(answerSummary) => update({ answerSummary })}
            onEnter={() => editor?.commands.focus("start")}
          />

          {editor ? (
            <EditorToolbar
              editor={editor}
              onRequestImage={() => setPicker("inline")}
              className="sticky top-[7.5rem] z-20 border-t bg-surface/95 backdrop-blur lg:top-16"
              trailing={
                <AiAssistant
                  editor={editor}
                  enabled={aiEnabled}
                  title={draft.title}
                  focusKeyword={draft.focusKeyword}
                  clientId={primaryClientId}
                  onApplyTitle={(title) => update({ title })}
                  onApplySeo={applySeo}
                  onApplyGeo={applyGeo}
                  onOpenFullArticle={() => setFullArticleOpen(true)}
                />
              }
            />
          ) : (
            <div className="h-[53px] border-y border-line" aria-hidden />
          )}

          <div className="px-5 py-8 sm:px-10 lg:px-14">
            <div className="mx-auto max-w-[720px]">
              <EditorContent editor={editor} />
            </div>
          </div>

          <div className="divide-y divide-line border-t border-line">
            <TakeawaysBlock items={draft.keyTakeaways} onChange={(keyTakeaways) => update({ keyTakeaways })} />
            <FaqBlock items={draft.faq} onChange={(faq) => update({ faq })} />
            <SourcesBlock
              items={draft.sources}
              onChange={(sources) => update({ sources })}
              suggestions={sourceSuggestions}
              onDismissSuggestions={() => setSourceSuggestions([])}
            />
          </div>

          <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-5 py-3 text-[13px] text-muted tabular-nums sm:px-10 lg:px-14">
            <span>
              {words.toLocaleString("pt-BR")} {words === 1 ? "palavra" : "palavras"}
            </span>
            <span>{words ? readingMinutes(words) : 0} min de leitura</span>
          </footer>
        </article>

        <aside aria-label="Configurações do artigo" className="min-w-0 space-y-4">
          <RailSection
            title="Destinos"
            summary={draft.destinations.length ? `${draft.destinations.length} ${draft.destinations.length === 1 ? "site" : "sites"}` : "Nenhum"}
          >
            <DestinationsSection
              sites={sites}
              destinations={draft.destinations}
              publications={publications}
              busySiteId={busySiteId}
              onToggle={toggleSite}
              onCanonical={setCanonical}
              onUnpublish={(siteId) => void takeOffSite(siteId, false)}
              onRemove={(siteId) => void removeSite(siteId)}
            />
          </RailSection>

          <RailSection id="editor-seo" title="SEO" summary={`${report.score} de ${report.total}`}>
            <SeoSection
              report={report}
              focusKeyword={draft.focusKeyword}
              seoTitle={draft.seoTitle}
              seoDescription={draft.seoDescription}
              slug={draft.slug}
              slugTouched={draft.slugTouched}
              title={draft.title}
              excerpt={draft.excerpt}
              published={status === "published"}
              previewSite={primarySite}
              onChange={(patch) => update({ ...patch, ...(patch.slug !== undefined ? { slugTouched: true } : {}) })}
              onResetSlug={() => update((d) => ({ slug: slugify(d.title), slugTouched: false }))}
            />
          </RailSection>

          <RailSection id="editor-geo" title="GEO" summary={`${geo.score} de ${geo.total}`}>
            <GeoSection
              report={geo}
              authorName={draft.authorName}
              expert={expert}
              aiEnabled={aiEnabled}
              onUseExpert={(authorName) => {
                update({ authorName });
                toast.success(`Autor definido: ${authorName}`);
              }}
            />
          </RailSection>

          <RailSection title="Detalhes" defaultOpen={false}>
            <DetailsSection
              excerpt={draft.excerpt}
              category={draft.category}
              tags={draft.tags}
              authorName={draft.authorName}
              contentType={draft.contentType}
              scheduledLocal={draft.scheduledLocal}
              categories={categories}
              defaultAuthor="Autor padrão de cada site"
              scheduleLocked={status === "published"}
              onChange={(patch) => update(patch)}
            />
          </RailSection>

          <RailSection
            title="Variações por site"
            defaultOpen={false}
            summary={variationCount ? `${variationCount} ${variationCount === 1 ? "variação" : "variações"}` : undefined}
          >
            <VariationsSection
              sites={sites}
              destinations={draft.destinations}
              mainHtml={draft.contentHtml}
              mainFaq={completeFaq(draft.faq)}
              aiEnabled={aiEnabled}
              generatingSiteId={generatingSiteId}
              onChange={patchDestination}
              onGenerate={(siteId) => void generateVariation(siteId)}
            />
          </RailSection>

          <RailSection title="Histórico" defaultOpen={false} summary={revisions.length ? `${revisions.length}` : undefined}>
            <HistorySection revisions={revisions} restoringId={restoringId} onRestore={(r) => void onRestore(r)} saved={Boolean(postId)} />
          </RailSection>
        </aside>
      </div>

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        status={status}
        value={draft.scheduledLocal}
        onChange={(scheduledLocal) => update({ scheduledLocal })}
        onSchedule={runSchedule}
        onCancelSchedule={() => void runCancelSchedule()}
        busy={scheduling}
        destinationCount={draft.destinations.length}
      />

      <DeliveryPanel
        state={delivery}
        sites={sites}
        onClose={() => setDelivery(null)}
        onRetry={(siteIds) => runPublish(siteIds)}
      />

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        clientId={primaryClientId}
        onSelect={(m) => {
          if (picker === "cover") update({ coverUrl: m.url, coverAlt: m.alt ?? "" });
          else if (picker === "inline" && editor) editor.chain().focus().setImage({ src: m.url, alt: m.alt ?? "" }).run();
          setPicker(null);
        }}
      />

      {fullArticleOpen ? (
        <FullArticleDialog
          initial={{
            topic: initialAi?.topic || draft.title,
            keyword: initialAi?.keyword || draft.focusKeyword,
            clientId: primaryClientId || initialClientId,
            contentType: draft.contentType,
          }}
          clients={clientOptions}
          enabled={aiEnabled}
          onClose={() => setFullArticleOpen(false)}
          onGenerated={applyFullArticle}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}
