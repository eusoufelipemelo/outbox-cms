"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type IntegrationTab = { id: string; label: string; content: ReactNode };

/** Abas acessíveis (setas esquerda/direita, Home/End) para os guias de integração. */
export function IntegrationTabs({ tabs, defaultTab }: { tabs: IntegrationTab[]; defaultTab?: string }) {
  const baseId = useId();
  const [active, setActive] = useState(defaultTab && tabs.some((t) => t.id === defaultTab) ? defaultTab : tabs[0]?.id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((t) => t.id === active);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Formas de integrar"
        onKeyDown={onKeyDown}
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1"
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "relative h-11 shrink-0 cursor-pointer px-3 text-[14px] whitespace-nowrap transition-colors duration-150",
                selected ? "font-semibold text-ink" : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
              {selected ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-ink" /> : null}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) =>
        tab.id === active ? (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${baseId}-panel-${tab.id}`}
            aria-labelledby={`${baseId}-tab-${tab.id}`}
            tabIndex={0}
            className="pt-6 focus-visible:outline-offset-4"
          >
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
