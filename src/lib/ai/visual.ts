/** Direção visual das imagens de IA: o que faz a capa parecer do cliente, não de banco de imagens. */

export type VisualClient = {
  name?: string | null;
  segment?: string | null;
  brand_color?: string | null;
  image_style?: string | null;
  image_mood?: string | null;
};

export const IMAGE_MOODS = [
  { value: "auto", label: "Automático", hint: "A IA escolhe pelo tema do artigo." },
  { value: "escuro", label: "Escuro", hint: "Fundos escuros, luz baixa, contraste alto." },
  { value: "claro", label: "Claro", hint: "Fundos claros, luz suave e arejada." },
  { value: "colorido", label: "Colorido", hint: "Cores vivas e saturadas." },
  { value: "monocromatico", label: "Monocromático", hint: "Uma cor só, com variações de tom." },
] as const;

const MOOD_EN: Record<string, string> = {
  escuro: "dark, moody scene: deep near-black background, low-key lighting, strong contrast",
  claro: "bright, airy scene: light background, soft daylight, gentle shadows",
  colorido: "vivid, saturated colors with confident color blocking",
  monocromatico: "monochromatic palette built from a single hue and its tones",
};

/** Nome da cor em inglês a partir do hex, para o modelo não depender só do código. */
function colorName(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) return l > 0.75 ? "near-white grey" : l < 0.2 ? "near-black" : "neutral grey";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const names: [number, string][] = [
    [10, "red"],
    [45, "orange"],
    [65, "yellow"],
    [172, "green"],
    [200, "teal"],
    [250, "blue"],
    [290, "violet"],
    [330, "magenta"],
    [360, "red"],
  ];
  const base = names.find(([limit]) => h <= limit)?.[1] ?? "blue";
  const tone = l < 0.3 ? "deep " : l > 0.7 ? "light " : "";
  return `${tone}${base}`;
}

/**
 * Frase de direção de arte somada ao prompt da imagem. Vazia quando o cliente não tem
 * nada definido — aí a imagem segue só o tema do artigo.
 */
export function visualDirection(client: VisualClient | null | undefined): string {
  if (!client) return "";
  const parts: string[] = [];
  const mood = client.image_mood && client.image_mood !== "auto" ? MOOD_EN[client.image_mood] : null;
  if (mood) parts.push(mood);
  const hex = client.brand_color?.trim();
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) {
    parts.push(`brand accent color ${hex} (${colorName(hex)}) present in the scene as light, object or material — as an accent, never as a flat overlay`);
  }
  const style = client.image_style?.trim();
  if (style) parts.push(`Art direction from the brand: ${style}`);
  if (!parts.length) return "";
  return ` Visual identity: ${parts.join("; ")}. Keep the same look across every image of this brand.`;
}

/** Resumo em português para mostrar na interface. */
export function visualSummary(client: VisualClient | null | undefined): string | null {
  if (!client) return null;
  const bits: string[] = [];
  const mood = IMAGE_MOODS.find((m) => m.value === client.image_mood && m.value !== "auto");
  if (mood) bits.push(mood.label.toLowerCase());
  if (client.brand_color) bits.push(`cor ${client.brand_color}`);
  if (client.image_style?.trim()) bits.push("estilo próprio");
  return bits.length ? bits.join(", ") : null;
}
