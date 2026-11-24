"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fillClientIdentity, type IdentityResult } from "@/lib/data/client-actions";

type Item = { id: string; name: string };
type Done = { id: string; ok: true; data: IdentityResult } | { id: string; ok: false; error: string };

/**
 * Clientes sem "Estilo das imagens": as capas e os posts saem genéricos (e o Instagram com o laranja
 * da OutBox). Monta a identidade de cada um pelo site e pelo cadastro, um por vez, e mostra o resultado.
 */
export function IdentityFill({ missing }: { missing: Item[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Done[]>([]);
  if (!missing.length && !done.length) return null;

  async function run() {
    setRunning(true);
    setDone([]);
    for (const c of missing) {
      const res = await fillClientIdentity(c.id).catch(() => ({ ok: false as const, error: `${c.name}: falhou.` }));
      setDone((d) => [...d, res.ok && res.data ? { id: c.id, ok: true, data: res.data } : { id: c.id, ok: false, error: res.ok ? `${c.name}: falhou.` : res.error }]);
    }
    setRunning(false);
    router.refresh();
  }

  const left = missing.length - done.length;
  return (
    <section className="mb-5 rounded-[var(--radius-panel)] border border-line bg-surface p-4 sm:p-5" aria-labelledby="identidade-visual">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[640px]">
          <h2 id="identidade-visual" className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <Palette className="size-[18px] text-muted" aria-hidden />
            {missing.length === 1 ? "1 cliente sem identidade visual completa nas imagens" : `${missing.length} clientes sem identidade visual completa nas imagens`}
          </h2>
          <p className="mt-1 text-[13.5px] text-muted">
            Sem cor, tom e estilo definidos, as capas e os posts saem genéricos. O CMS lê o site e o cadastro de cada um e preenche os três campos. Dá para
            ajustar depois no cadastro.
          </p>
        </div>
        <Button onClick={run} loading={running} disabled={running || !missing.length}>
          {running ? `Montando… faltam ${left}` : "Montar identidade de todos"}
        </Button>
      </div>
      {done.length ? (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {done.map((d) => {
            const name = missing.find((m) => m.id === d.id)?.name ?? "";
            return (
              <li key={d.id} className="flex items-start gap-3 py-3">
                {d.ok && d.data.brand_color ? (
                  <span aria-hidden className="mt-1 size-4 shrink-0 rounded-full ring-1 ring-line" style={{ background: d.data.brand_color }} />
                ) : (
                  <span aria-hidden className="mt-1 size-4 shrink-0 rounded-full bg-sunken ring-1 ring-line" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">
                    <Link href={`/clientes/${d.id}`} className="hover:underline">
                      {name}
                    </Link>
                    {d.ok ? <span className="font-normal text-muted"> · {d.data.brand_color ?? "sem cor"} · tom {d.data.image_mood}</span> : null}
                  </p>
                  <p className={d.ok ? "mt-0.5 text-[13.5px] text-text" : "mt-0.5 text-[13.5px] text-danger"}>{d.ok ? d.data.image_style : d.error}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
