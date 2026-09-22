import type { ClientUnit } from "@/lib/types";

/** Lê a lista de unidades do banco (JSON), descartando o que estiver incompleto. */
export function parseUnits(raw: unknown): ClientUnit[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return raw
    .map((u) => (u && typeof u === "object" ? (u as Record<string, unknown>) : null))
    .filter((u): u is Record<string, unknown> => Boolean(u && s(u.city) && s(u.label)))
    .map((u) => ({
      id: s(u.id) ?? crypto.randomUUID(),
      label: s(u.label)!,
      address: s(u.address),
      city: s(u.city)!,
      state: s(u.state)?.toUpperCase() ?? null,
      phone: s(u.phone),
      manager: s(u.manager),
      maps_name: s(u.maps_name),
    }));
}

/** "Brasília/DF" */
export function unitPlace(u: Pick<ClientUnit, "city" | "state">): string {
  return u.state ? `${u.city}/${u.state}` : u.city;
}
