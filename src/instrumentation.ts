// Inicia o agendador de publicações no servidor Node.js (Docker/Easypanel: processo de longa duração).
// Em ambientes serverless, use o cron externo em /api/cron/publish-scheduled.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.OUTBOX_DISABLE_SCHEDULER === "1") return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[scheduler] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes: agendador interno desligado.");
    return;
  }
  const g = globalThis as typeof globalThis & { __outboxSchedulerBoot?: boolean };
  if (g.__outboxSchedulerBoot) return;
  g.__outboxSchedulerBoot = true;
  try {
    const { startScheduler } = await import("@/lib/delivery/scheduler");
    startScheduler();
  } catch (err) {
    g.__outboxSchedulerBoot = false;
    console.error("[scheduler] não foi possível iniciar o agendador:", err);
  }
}
