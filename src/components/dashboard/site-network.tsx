import Link from "next/link";
import { ExternalLink, PenLine } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { cn, formatDate, hostname } from "@/lib/utils";
import {
  ATTENTION_MAX_DAYS,
  FRESH_MAX_DAYS,
  PULSE_WEEKS,
  type DashboardData,
  type Freshness,
  type NetworkClient,
  type NetworkSite,
} from "@/lib/data/dashboard";

const STATE: Record<Freshness, { label: string; tone: "ok" | "warn" | "danger" | "neutral"; bar: string; text: string }> = {
  fresh: { label: "Em dia", tone: "ok", bar: "bg-ok", text: "text-ok" },
  attention: { label: "Atenção", tone: "warn", bar: "bg-warn", text: "text-warn" },
  stale: { label: "Parado", tone: "danger", bar: "bg-danger", text: "text-danger" },
  paused: { label: "Site pausado", tone: "neutral", bar: "bg-line-strong", text: "text-faint" },
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Barra proporcional + resumo em frase dos estados da rede. */
function Distribution({ counts }: { counts: DashboardData["counts"] }) {
  const total = counts.fresh + counts.attention + counts.stale;
  if (!total) return null;
  const parts = [
    { key: "stale", n: counts.stale, cls: "bg-danger" },
    { key: "attention", n: counts.attention, cls: "bg-warn" },
    { key: "fresh", n: counts.fresh, cls: "bg-ok" },
  ].filter((p) => p.n > 0);
  const sentence = [
    counts.stale ? plural(counts.stale, "parado", "parados") : null,
    counts.attention ? `${counts.attention} em atenção` : null,
    counts.fresh ? `${counts.fresh} em dia` : null,
  ].filter(Boolean);
  const text = sentence.length > 1 ? `${sentence.slice(0, -1).join(", ")} e ${sentence.at(-1)}` : sentence[0];
  return (
    <div className="space-y-2">
      <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", p.cls)} style={{ flexGrow: p.n, flexBasis: 0 }} />
        ))}
      </div>
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">{plural(total, "site ativo", "sites ativos")}:</span> {text}.
      </p>
    </div>
  );
}

/** Ritmo de publicação: uma barra por semana, da mais antiga à atual. */
function Pulse({ weeks }: { weeks: number[] }) {
  const active = weeks.filter((w) => w > 0).length;
  return (
    <div
      role="img"
      aria-label={`Ritmo das últimas ${PULSE_WEEKS} semanas: ${plural(active, "semana", "semanas")} com artigo publicado`}
      title={`${plural(active, "semana", "semanas")} com artigo nas últimas ${PULSE_WEEKS}`}
      className="flex h-4 items-end gap-[3px]"
    >
      {weeks.map((n, i) => (
        <span
          key={i}
          className={cn("w-[5px] rounded-[2px]", n === 0 ? "h-[3px] bg-line-strong" : "bg-ink", n === 1 && "h-2", n === 2 && "h-3", n >= 3 && "h-4")}
        />
      ))}
    </div>
  );
}

// Mesmo desenho do `.display`, mas sem fixar a cor (o estado colore o número).
const numeral = "font-extrabold [font-stretch:112%] tracking-[-0.02em]";

function Days({ site }: { site: NetworkSite }) {
  const s = STATE[site.freshness];
  if (site.daysSince === null) {
    return (
      <p className="leading-none">
        <span className={cn(numeral, "text-[19px]", s.text)}>nunca</span>
        <span className="mt-1 block text-[12px] text-muted">publicou</span>
      </p>
    );
  }
  if (site.daysSince === 0) {
    return (
      <p className="leading-none">
        <span className={cn(numeral, "text-[22px]", s.text)}>hoje</span>
        <span className="mt-1 block text-[12px] text-muted">último artigo</span>
      </p>
    );
  }
  return (
    <p className="leading-none">
      <span className={cn(numeral, "text-[28px] tabular-nums", s.text)}>{site.daysSince}</span>
      <span className="mt-1 block text-[12px] text-muted">{site.daysSince === 1 ? "dia sem artigo" : "dias sem artigo"}</span>
    </p>
  );
}

function SiteRow({ site }: { site: NetworkSite }) {
  const s = STATE[site.freshness];
  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2.5 py-3.5 pl-4",
        "md:grid-cols-[minmax(0,11rem)_6rem_minmax(0,1fr)_auto]",
        site.paused && "opacity-70",
      )}
    >
      <span aria-hidden className={cn("absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-full", s.bar)} />
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-medium text-ink">{site.name}</p>
        <a
          href={site.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 truncate text-[13px] text-muted hover:text-ink"
        >
          <span className="truncate">{hostname(site.url)}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      </div>
      <Days site={site} />
      <div className="col-span-2 min-w-0 md:col-span-1">
        {site.lastTitle && site.lastPostId ? (
          <>
            <Link href={`/artigos/${site.lastPostId}`} className="line-clamp-1 text-[14px] text-text hover:text-ink hover:underline">
              {site.lastTitle}
            </Link>
            <p className="text-[12.5px] text-muted">Publicado em {formatDate(site.lastPublishedAt)}</p>
          </>
        ) : (
          <p className="text-[14px] text-muted">Nenhum artigo publicado neste site ainda.</p>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-between gap-4 md:col-span-1 md:flex-col md:items-end md:gap-2">
        <Pulse weeks={site.weeks} />
        <Badge tone={s.tone} className="min-w-[5.5rem] justify-center">
          <StatusDot tone={s.tone} />
          {s.label}
        </Badge>
      </div>
    </li>
  );
}

function ClientGroup({ client }: { client: NetworkClient }) {
  const meta = [client.segment, client.place].filter(Boolean).join(" em ");
  return (
    <section aria-labelledby={`rede-${client.id}`} className="px-5 py-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={`rede-${client.id}`} className="text-[16px] font-semibold text-ink">
            <Link href={`/clientes/${client.id}`} className="hover:underline">
              {client.name}
            </Link>
          </h3>
          {meta ? <p className="text-[13px] text-muted first-letter:uppercase">{meta}</p> : null}
        </div>
        {client.sites.length ? (
          <Link href={`/artigos/novo?cliente=${client.id}`} className={buttonClass("secondary", "sm", "h-10 sm:h-8")}>
            <PenLine className="size-3.5" aria-hidden />
            Escrever para este cliente
          </Link>
        ) : null}
      </header>
      {client.sites.length ? (
        <ul className="mt-1 divide-y divide-line">
          {client.sites.map((site) => (
            <SiteRow key={site.id} site={site} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Nenhum site cadastrado.{" "}
          <Link href={`/clientes/${client.id}`} className="font-medium text-ink underline underline-offset-2">
            Adicione um site
          </Link>{" "}
          para publicar os artigos deste cliente.
        </p>
      )}
    </section>
  );
}

export function SiteNetwork({ network, counts }: { network: NetworkClient[]; counts: DashboardData["counts"] }) {
  return (
    <section aria-labelledby="rede-titulo" className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <header className="space-y-4 border-b border-line px-5 py-5">
        <div>
          <h2 id="rede-titulo" className="text-[19px] font-bold tracking-[-0.01em] text-ink">
            Rede de sites
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            Há quantos dias cada blog não recebe artigo novo, dos mais esquecidos para os mais recentes. Em dia até {FRESH_MAX_DAYS} dias,
            atenção até {ATTENTION_MAX_DAYS}, parado depois disso.
          </p>
        </div>
        <Distribution counts={counts} />
      </header>
      <div className="divide-y divide-line">
        {network.map((client) => (
          <ClientGroup key={client.id} client={client} />
        ))}
      </div>
    </section>
  );
}
