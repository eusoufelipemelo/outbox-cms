import "server-only";
import { CAPITAIS, UF_NOME } from "@/lib/geo/brasil";
import { listClients } from "./clients";

export type MapClient = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  uf: string | null;
  /** UF deduzida pela cidade (o cadastro não tem o estado preenchido). */
  inferred: boolean;
  status: "active" | "paused" | "archived";
  site: string | null;
  /** Nome da unidade quando o ponto é uma filial ("Filial Brasília"); nulo para a matriz. */
  unit: string | null;
  /** Chave única no mapa (cliente + unidade). */
  key: string;
};

const fold = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const CAPITAL_UF = new Map(Object.entries(CAPITAIS).map(([uf, city]) => [fold(city), uf]));

/** "Campinas - SP", "Campinas/SP" ou "Campinas, SP" → { city: "Campinas", uf: "SP" }. */
function splitCity(raw: string | null): { city: string | null; uf: string | null } {
  if (!raw) return { city: null, uf: null };
  const m = raw.match(/^(.+?)\s*(?:[-/,])\s*([A-Za-z]{2})$/);
  if (m && UF_NOME[m[2].toUpperCase()]) return { city: m[1].trim(), uf: m[2].toUpperCase() };
  return { city: raw.trim(), uf: null };
}

/** Clientes (menos os arquivados) com estado e cidade prontos para o mapa. */
export async function listClientMap(): Promise<MapClient[]> {
  const clients = await listClients();
  return clients
    .filter((c) => c.status !== "archived")
    .flatMap((c) => {
      const parsed = splitCity(c.city);
      const state = c.state?.trim().toUpperCase() ?? "";
      let uf = UF_NOME[state] ? state : parsed.uf;
      let inferred = !UF_NOME[state] && Boolean(parsed.uf);
      if (!uf && parsed.city) {
        uf = CAPITAL_UF.get(fold(parsed.city)) ?? null;
        inferred = Boolean(uf);
      }
      const url = c.sites[0]?.url ?? null;
      const site = url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null;
      const main: MapClient = { id: c.id, key: c.id, name: c.name, segment: c.segment, city: parsed.city, uf, inferred, status: c.status, site, unit: null };
      const units: MapClient[] = c.units.map((u) => ({
        id: c.id,
        key: `${c.id}:${u.id}`,
        name: c.name,
        segment: c.segment,
        city: u.city,
        uf: u.state && UF_NOME[u.state] ? u.state : (CAPITAL_UF.get(fold(u.city)) ?? null),
        inferred: !u.state,
        status: c.status,
        site,
        unit: u.label,
      }));
      return [main, ...units];
    });
}
