import "server-only";
import { db } from "@/lib/supabase/admin";

// Lado da equipe: quem do cliente entra na área do cliente (/cliente).

export type ClientAccessRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  companyName: string | null;
  status: "pending" | "active" | "blocked";
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  approvedAt: string | null;
};

export type ClientInviteRow = { email: string; clientId: string; clientName: string; createdAt: string };

const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listClientAccess(): Promise<{ accounts: ClientAccessRow[]; invites: ClientInviteRow[] }> {
  const [accounts, invites] = await Promise.all([
    db()
      .from("profiles")
      .select("id, name, email, phone, company_name, status, client_id, created_at, approved_at, clients:client_id(name)")
      .eq("role", "client")
      .order("created_at", { ascending: false }),
    db().from("client_invites").select("email, client_id, created_at, clients:client_id(name)").order("created_at", { ascending: false }),
  ]);
  type A = {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    company_name: string | null;
    status: ClientAccessRow["status"];
    client_id: string | null;
    created_at: string;
    approved_at: string | null;
    clients: { name: string } | { name: string }[] | null;
  };
  type I = { email: string; client_id: string; created_at: string; clients: { name: string } | { name: string }[] | null };
  return {
    accounts: ((accounts.data ?? []) as unknown as A[]).map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      phone: a.phone,
      companyName: a.company_name,
      status: a.status,
      clientId: a.client_id,
      clientName: one(a.clients)?.name ?? null,
      createdAt: a.created_at,
      approvedAt: a.approved_at,
    })),
    invites: ((invites.data ?? []) as unknown as I[]).map((i) => ({
      email: i.email,
      clientId: i.client_id,
      clientName: one(i.clients)?.name ?? "Cliente",
      createdAt: i.created_at,
    })),
  };
}

/** Cadastros de cliente esperando a equipe ligar a uma empresa (selo no menu). */
export async function countPendingClientAccounts(): Promise<number> {
  const { count } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").eq("status", "pending");
  return count ?? 0;
}
