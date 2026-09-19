"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { id: string };

/** Campo de senha com botão de mostrar/ocultar. */
export function PasswordInput({ id, className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} className={cn("h-11 pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  );
}

type Level = { score: 0 | 1 | 2 | 3; label: string };

export function passwordLevel(value: string, min = 8): Level {
  if (!value) return { score: 0, label: `Use pelo menos ${min} caracteres.` };
  if (value.length < min) {
    const left = min - value.length;
    return { score: 0, label: `Faltam ${left} ${left === 1 ? "caractere" : "caracteres"}.` };
  }
  let points = 0;
  if (value.length >= 12) points++;
  if (/[a-z]/i.test(value) && /\d/.test(value)) points++;
  if (/[^a-z0-9]/i.test(value)) points++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points++;
  if (points <= 1) return { score: 1, label: "Senha fraca. Misture letras, números e símbolos." };
  if (points === 2) return { score: 2, label: "Senha razoável. Mais caracteres ou um símbolo deixam mais forte." };
  return { score: 3, label: "Senha forte." };
}

const barTone = ["bg-line", "bg-danger", "bg-warn", "bg-ok"] as const;
const textTone = ["text-muted", "text-danger", "text-warn", "text-ok"] as const;

/** Medidor de força em 3 segmentos + dica em texto (a cor nunca é a única pista). */
export function PasswordStrength({ value, id }: { value: string; id: string }) {
  const level = passwordLevel(value);
  return (
    <div className="space-y-1.5">
      <div aria-hidden className="grid grid-cols-3 gap-1">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn("h-1 rounded-full transition-colors duration-200", level.score >= n ? barTone[level.score] : "bg-line")}
          />
        ))}
      </div>
      <p id={id} aria-live="polite" className={cn("text-[13px]", value ? textTone[level.score] : "text-muted")}>
        {level.label}
      </p>
    </div>
  );
}
