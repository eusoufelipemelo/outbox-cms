import "server-only";
import { env } from "@/lib/env";

/**
 * Perfil da Empresa no Google (via Places API). Procura pelo nome + cidade e confirma pelo site.
 * Publicações do perfil (posts) não são expostas pela API: o relatório indica verificação manual.
 */

export type BusinessResult = {
  found: boolean;
  error?: string;
  query?: string;
  name?: string;
  address?: string;
  mapsUrl?: string;
  rating?: number | null;
  reviews?: number;
  status?: string;
  category?: string | null;
  phone?: boolean;
  hours?: boolean;
  website?: string | null;
  websiteMatches?: boolean;
  photos?: number;
  /** Data da avaliação mais recente, para saber se o perfil recebe atenção. */
  lastReview?: string | null;
  checks: { label: string; ok: boolean; detail: string }[];
};

type Place = {
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
  nationalPhoneNumber?: string;
  regularOpeningHours?: unknown;
  websiteUri?: string;
  photos?: unknown[];
  reviews?: { publishTime?: string }[];
};

function host(u?: string | null): string {
  if (!u) return "";
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** `strict`: só aceita o perfil cujo site bate com o domínio (usado quando o nome foi deduzido do título). */
export async function findBusiness(input: { url: string; name?: string | null; city?: string | null; strict?: boolean }): Promise<BusinessResult> {
  const key = env.googleApiKey;
  if (!key) return { found: false, error: "Configure GOOGLE_API_KEY (Places API) para analisar o Google Empresas.", checks: [] };
  const domain = host(input.url);
  const query = [input.name || domain, input.city].filter(Boolean).join(" ");

  let places: Place[] = [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.regularOpeningHours,places.websiteUri,places.photos,places.reviews",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", pageSize: 5 }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { places?: Place[]; error?: { message?: string } };
    if (!res.ok) return { found: false, query, error: json.error?.message?.slice(0, 200) ?? `HTTP ${res.status}`, checks: [] };
    places = json.places ?? [];
  } catch {
    return { found: false, query, error: "A busca no Google Empresas não respondeu.", checks: [] };
  }

  const place = places.find((p) => host(p.websiteUri) === domain) ?? (input.name && !input.strict ? places[0] : undefined);
  if (!place) return { found: false, query, checks: [] };

  const reviews = place.userRatingCount ?? 0;
  const rating = place.rating ?? null;
  const photos = place.photos?.length ?? 0;
  const lastReview = (place.reviews ?? []).map((r) => r.publishTime).filter(Boolean).sort().pop() ?? null;
  const websiteMatches = host(place.websiteUri) === domain;
  const daysSince = lastReview ? Math.round((Date.now() - Date.parse(lastReview)) / 86_400_000) : null;

  const checks = [
    { label: "Empresa ativa no Google", ok: place.businessStatus === "OPERATIONAL", detail: place.businessStatus === "OPERATIONAL" ? "Perfil marcado como em funcionamento." : "O perfil não aparece como em funcionamento." },
    { label: "Site vinculado ao perfil", ok: websiteMatches, detail: websiteMatches ? "O perfil aponta para o site analisado." : place.websiteUri ? `O perfil aponta para ${host(place.websiteUri)}.` : "O perfil não tem site cadastrado." },
    { label: "Nota média 4,5 ou mais", ok: (rating ?? 0) >= 4.5, detail: rating ? `Nota ${rating.toFixed(1).replace(".", ",")}.` : "Sem nota ainda." },
    { label: "Pelo menos 50 avaliações", ok: reviews >= 50, detail: `${reviews} avaliações.` },
    { label: "Avaliação recente (até 30 dias)", ok: daysSince !== null && daysSince <= 30, detail: daysSince === null ? "Sem avaliações recentes visíveis." : `Última avaliação há ${daysSince} dias.` },
    { label: "Horário de funcionamento", ok: Boolean(place.regularOpeningHours), detail: place.regularOpeningHours ? "Horário cadastrado." : "Sem horário cadastrado." },
    { label: "Telefone cadastrado", ok: Boolean(place.nationalPhoneNumber), detail: place.nationalPhoneNumber ? "Telefone visível no perfil." : "Sem telefone no perfil." },
    { label: "Fotos no perfil (10 ou mais)", ok: photos >= 10, detail: photos >= 10 ? "Perfil com fotos." : `Poucas fotos visíveis (${photos}).` },
  ];

  return {
    found: true,
    query,
    name: place.displayName?.text,
    address: place.formattedAddress,
    mapsUrl: place.googleMapsUri,
    rating,
    reviews,
    status: place.businessStatus,
    category: place.primaryTypeDisplayName?.text ?? null,
    phone: Boolean(place.nationalPhoneNumber),
    hours: Boolean(place.regularOpeningHours),
    website: place.websiteUri ?? null,
    websiteMatches,
    photos,
    lastReview,
    checks,
  };
}
