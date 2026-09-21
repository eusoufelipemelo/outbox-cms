"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Marca o elemento com data-shown quando ele entra na tela; a animação fica no CSS (.reveal em globals.css). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.shown = "";
          io.disconnect();
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <li ref={ref} className={`reveal ${className ?? ""}`} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </li>
  );
}
