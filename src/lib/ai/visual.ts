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

/**
 * Regras de realismo somadas a toda foto gerada (capas, lâminas do Instagram, Mídia).
 * Existem para evitar o "jeito de IA": celular gigante na mão, objetos flutuando, pose de banco de imagens.
 */
export const PHOTO_REALISM =
  " Authentic documentary-style photograph, as if taken by a professional photographer with a full-frame camera and a 35mm lens at eye level, natural available light." +
  " Everything at true real-world scale and correct perspective: hands, fingers and objects anatomically correct, physically resting on surfaces or held naturally, nothing floating, nothing oversized." +
  " People are candid and unposed, absorbed in real work, natural skin texture, relaxed expressions, not looking at the camera." +
  " If a phone, tablet or computer appears, it is a small secondary element at its real size, seen from the side, with the screen not readable; never a device held up toward the camera, never a visible app, map or interface." +
  " Real Brazilian place with lived-in details and small imperfections. One clear subject, uncluttered composition." +
  " No text, letters, numbers, logos, signs or watermarks. Not a stock photo, not CGI, not an illustration, no collage.";

/** Orientação em português para a IA que escreve a cena (capa, lâmina ou post). */
export const SCENE_GUIDE = `Como escrever a cena da foto:
- Mostre a realidade física do negócio: o ambiente pronto, o material, o detalhe do acabamento, o profissional trabalhando com as mãos, o cliente sendo atendido no local.
- Tema digital (Google, Instagram, site, anúncios, avaliações) não vira foto de tela: mostre o resultado na vida real, como clientes chegando à loja, o atendimento, o produto entregue.
- Nada de pessoa segurando celular ou tablet virado para a câmera, nada de telas com mapa, estrelas ou aplicativo, nada de apertos de mão, gráficos, setas ou símbolos.
- Uma cena só, concreta e plausível no Brasil, com detalhes de material, luz (direção e hora do dia) e enquadramento (plano aberto, médio ou detalhe).
- Pessoas comuns, com roupa de trabalho real, em ação natural, sem pose e sem olhar para a câmera.
- Sem texto, letreiros, logotipos ou marcas visíveis.`;

/** Prompt final de uma foto: a cena + as regras de realismo + a identidade visual do cliente. */
export function photoPrompt(scene: string, client?: VisualClient | null): string {
  return `${scene.trim().replace(/\s+/g, " ")}${PHOTO_REALISM}${visualDirection(client)}`;
}

/** "Estilo das imagens" vazio ou cortado no meio da frase: o CMS monta de novo. */
export function styleNeedsWork(style: string | null | undefined): boolean {
  const t = style?.trim() ?? "";
  return !t || (t.length >= 590 && !/[.!?)]$/.test(t));
}
