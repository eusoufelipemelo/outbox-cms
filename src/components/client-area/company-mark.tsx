"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientCompany } from "@/lib/client-auth";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "")).toUpperCase() || "•";
}

/** Marca da empresa do cliente: o logo dele quando carregar, senão um monograma com as iniciais. */
export function CompanyMark({ company, size = 44 }: { company: Pick<ClientCompany, "name" | "logo_url">; size?: number }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // a imagem pode falhar antes da hidratação, quando o onError ainda não existe
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setBroken(true);
  }, []);
  if (company.logo_url && !broken) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-line bg-surface" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- logo vem do storage de cada cliente; onError troca pelo monograma */}
        <img ref={img} src={company.logo_url} alt="" width={size} height={size} className="size-full object-contain p-1" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-ink font-extrabold tracking-[-0.02em] text-on-ink [font-stretch:112%]"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(company.name)}
    </span>
  );
}
