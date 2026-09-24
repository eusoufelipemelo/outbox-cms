import "server-only";
import { accessToken } from "./oauth";

/**
 * Google Business Profile API (Google Empresas).
 * - Contas e perfis: Account Management v1 e Business Information v1
 * - Publicações, avaliações e fotos: My Business v4
 * - Desempenho: Business Profile Performance v1
 */

export class GbpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GbpError";
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429 || /quota/i.test(msg)) {
      throw new GbpError("O Google ainda não liberou a cota da Business Profile API para este projeto (aguardando aprovação do pedido de acesso).", 429);
    }
    if (res.status === 403) throw new GbpError(`Sem permissão no Google Empresas: ${msg}. Confira se a API está ativada e se a conta da OutBox gerencia este perfil.`, 403);
    if (res.status === 401) throw new GbpError("O acesso ao Google expirou. Conecte a conta de novo em Google Empresas.", 401);
    throw new GbpError(`Google Empresas: ${msg}`.slice(0, 300), res.status);
  }
  return json;
}

// ---------------------------------------------------------------- contas e perfis

export type GbpAccount = { name: string; accountName?: string; type?: string };
export type GbpLocation = {
  name: string; // locations/123
  title: string;
  websiteUri?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string };
  metadata?: { mapsUri?: string };
};

export async function listAccounts(): Promise<GbpAccount[]> {
  const out: GbpAccount[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: "20", ...(page ? { pageToken: page } : {}) });
    const r = await call<{ accounts?: GbpAccount[]; nextPageToken?: string }>(`https://mybusinessaccountmanagement.googleapis.com/v1/accounts?${q}`);
    out.push(...(r.accounts ?? []));
    page = r.nextPageToken;
  } while (page);
  return out;
}

export async function listLocations(account: string): Promise<GbpLocation[]> {
  const out: GbpLocation[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ readMask: "name,title,websiteUri,storefrontAddress,metadata", pageSize: "100", ...(page ? { pageToken: page } : {}) });
    const r = await call<{ locations?: GbpLocation[]; nextPageToken?: string }>(`https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?${q}`);
    out.push(...(r.locations ?? []));
    page = r.nextPageToken;
  } while (page);
  return out;
}

// ---------------------------------------------------------------- avaliações

export type GbpReview = {
  name: string; // accounts/…/locations/…/reviews/…
  reviewer?: { displayName?: string };
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE" | "STAR_RATING_UNSPECIFIED";
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

export const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export async function listReviews(account: string, location: string, pageSize = 20): Promise<{ reviews: GbpReview[]; average?: number; total?: number }> {
  const r = await call<{ reviews?: GbpReview[]; averageRating?: number; totalReviewCount?: number }>(
    `https://mybusiness.googleapis.com/v4/${account}/${location}/reviews?pageSize=${pageSize}&orderBy=updateTime%20desc`,
  );
  return { reviews: r.reviews ?? [], average: r.averageRating, total: r.totalReviewCount };
}

export async function replyReview(reviewName: string, comment: string): Promise<void> {
  await call(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { method: "PUT", body: JSON.stringify({ comment }) });
}

// ---------------------------------------------------------------- publicações

/** Publicação "Novidade" com botão Saiba mais apontando para o artigo. */
export async function createPost(
  account: string,
  location: string,
  input: { summary: string; url: string; photoUrl?: string | null },
): Promise<{ name: string }> {
  return call<{ name: string }>(`https://mybusiness.googleapis.com/v4/${account}/${location}/localPosts`, {
    method: "POST",
    body: JSON.stringify({
      languageCode: "pt-BR",
      topicType: "STANDARD",
      summary: input.summary.slice(0, 1500),
      callToAction: { actionType: "LEARN_MORE", url: input.url },
      ...(input.photoUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: input.photoUrl }] } : {}),
    }),
  });
}

// ---------------------------------------------------------------- desempenho

const METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
] as const;

export type GbpMetrics = { views: number; calls: number; website: number; directions: number; days: number };

/** Soma dos últimos `days` dias (o Google entrega com 2 a 3 dias de atraso). */
export async function performance(location: string, days = 30): Promise<GbpMetrics> {
  const end = new Date(Date.now() - 2 * 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const q = new URLSearchParams();
  for (const m of METRICS) q.append("dailyMetrics", m);
  q.set("dailyRange.start_date.year", String(start.getUTCFullYear()));
  q.set("dailyRange.start_date.month", String(start.getUTCMonth() + 1));
  q.set("dailyRange.start_date.day", String(start.getUTCDate()));
  q.set("dailyRange.end_date.year", String(end.getUTCFullYear()));
  q.set("dailyRange.end_date.month", String(end.getUTCMonth() + 1));
  q.set("dailyRange.end_date.day", String(end.getUTCDate()));
  type Series = { dailyMetric?: string; timeSeries?: { datedValues?: { value?: string }[] } };
  const r = await call<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: Series[] }[] }>(
    `https://businessprofileperformance.googleapis.com/v1/${location}:fetchMultiDailyMetricsTimeSeries?${q}`,
  );
  const totals: Record<string, number> = {};
  for (const group of r.multiDailyMetricTimeSeries ?? []) {
    for (const s of group.dailyMetricTimeSeries ?? []) {
      const sum = (s.timeSeries?.datedValues ?? []).reduce((t, v) => t + Number(v.value ?? 0), 0);
      if (s.dailyMetric) totals[s.dailyMetric] = (totals[s.dailyMetric] ?? 0) + sum;
    }
  }
  return {
    views: METRICS.filter((m) => m.startsWith("BUSINESS_IMPRESSIONS")).reduce((t, m) => t + (totals[m] ?? 0), 0),
    calls: totals.CALL_CLICKS ?? 0,
    website: totals.WEBSITE_CLICKS ?? 0,
    directions: totals.BUSINESS_DIRECTION_REQUESTS ?? 0,
    days,
  };
}
