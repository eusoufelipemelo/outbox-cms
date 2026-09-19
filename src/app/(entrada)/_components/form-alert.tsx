import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mensagem de erro/sucesso do formulário. A região fica sempre no DOM para leitores de tela anunciarem. */
export function FormAlert({
  message,
  tone = "danger",
  className,
  children,
}: {
  message?: ReactNode;
  tone?: "danger" | "ok" | "info";
  className?: string;
  children?: ReactNode;
}) {
  const Icon = tone === "danger" ? AlertCircle : CheckCircle2;
  return (
    <div aria-live={tone === "danger" ? "assertive" : "polite"} className={message ? className : undefined}>
      {message ? (
        <div
          className={cn(
            "flex gap-2.5 rounded-[var(--radius-control)] px-3 py-2.5 text-[14px] leading-snug",
            tone === "danger" && "bg-danger-soft text-danger",
            tone === "ok" && "bg-ok-soft text-ok",
            tone === "info" && "bg-info-soft text-info",
          )}
        >
          <Icon className="mt-[1px] size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p>{message}</p>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}
