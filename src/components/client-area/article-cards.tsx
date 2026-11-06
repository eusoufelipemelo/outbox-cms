import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";
import type { PortalItem } from "@/lib/data/client-area";
import { cn, formatDate } from "@/lib/utils";

const STATUS: Record<PortalItem["status"], { label: string; className: string }> = {
  awaiting: { label: "Esperando você", className: "border border-ink/80 text-ink" },
  changes: { label: "OutBox ajustando", className: "bg-warn-soft text-warn" },
  published: { label: "No ar", className: "bg-ok-soft text-ok" },
};

export function StatusChip({ status, className }: { status: PortalItem["status"]; className?: string }) {
  const s = STATUS[status];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-semibold whitespace-nowrap", s.className, className)}>{s.label}</span>;
}

function Cover({ src, className }: { src: string | null; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-sunken", className)}>
      {src ? (
        <Image src={src} alt="" fill sizes="(min-width: 1024px) 480px, 100vw" className="object-cover" unoptimized />
      ) : (
        <div className="flex size-full items-center justify-center text-faint">
          <FileText className="size-8" aria-hidden strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

/** Artigo esperando decisão: capa grande, título e o convite para ler. */
export function DecisionCard({ item, featured = false }: { item: PortalItem; featured?: boolean }) {
  return (
    <Link
      href={`/cliente/artigos/${item.id}`}
      className={cn(
        "group block overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-pop",
        featured && "md:grid md:grid-cols-[1.1fr_1fr]",
      )}
    >
      <Cover src={item.cover} className={featured ? "aspect-[16/9] md:aspect-auto md:min-h-[300px]" : "aspect-[16/9]"} />
      <div className={cn("flex flex-col p-5", featured && "md:p-8")}>
        <div className="flex items-center gap-2">
          <StatusChip status={item.status} />
          <span className="text-[13px] text-muted">enviado em {formatDate(item.date)}</span>
        </div>
        <h3 className={cn("mt-3 font-bold tracking-[-0.01em] text-ink [text-wrap:balance]", featured ? "text-[22px] leading-[1.2] sm:text-[26px]" : "text-[18px] leading-snug")}>
          {item.title}
        </h3>
        {item.excerpt ? (
          <p className={cn("mt-2 text-[15px] leading-relaxed text-muted", featured ? "line-clamp-4" : "line-clamp-2")}>{item.excerpt}</p>
        ) : null}
        <span
          className={cn(
            "mt-5 inline-flex h-10 w-fit items-center rounded-[var(--radius-control)] bg-ink px-4 text-[14px] font-medium text-on-ink transition-colors group-hover:bg-ink-hover",
            featured && "md:mt-auto",
          )}
        >
          Ler e decidir
        </span>
      </div>
    </Link>
  );
}

/** Linha compacta: em ajuste (abre na área) ou publicado (abre no site). */
export function ArticleRow({ item }: { item: PortalItem }) {
  const external = item.status === "published" && item.url;
  const body = (
    <>
      <Cover src={item.cover} className="aspect-[4/3] w-[88px] shrink-0 rounded-[var(--radius-control)] sm:w-[112px]" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15.5px] leading-snug font-semibold text-ink [text-wrap:pretty]">{item.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusChip status={item.status} />
          <span className="text-[13px] text-muted">
            {item.status === "published" ? "publicado em " : item.status === "changes" ? "pedido em " : "enviado em "}
            {formatDate(item.date)}
          </span>
        </div>
        {item.status === "changes" && item.feedback ? (
          <p className="mt-2 line-clamp-2 text-[13.5px] text-text">Seu pedido: “{item.feedback}”</p>
        ) : null}
      </div>
      {external ? <ArrowUpRight className="mt-1 size-[18px] shrink-0 text-muted transition-colors group-hover:text-ink" aria-hidden /> : null}
    </>
  );
  const cls = "group flex items-start gap-4 rounded-[var(--radius-panel)] p-3 transition-colors hover:bg-sunken";
  return external ? (
    <a href={item.url!} target="_blank" rel="noreferrer" className={cls} aria-label={`${item.title} (abre o seu site)`}>
      {body}
    </a>
  ) : (
    <Link href={`/cliente/artigos/${item.id}`} className={cls}>
      {body}
    </Link>
  );
}
