import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/panel";
import { SiteNetwork } from "@/components/dashboard/site-network";
import { AttentionPanel, DraftsPanel, TopReadPanel, UpcomingPanel } from "@/components/dashboard/side-panels";
import { FirstArticle, Onboarding } from "@/components/dashboard/onboarding";
import { getDashboard, type DashboardData } from "@/lib/data/dashboard";
import { getAnalytics, toPeriod } from "@/lib/data/analytics";
import { listClientOptions } from "@/lib/data/clients";
import { isUuid } from "@/lib/data/sites";
import { Panel } from "@/components/ui/panel";
import { AreaChart, BarList, ColumnChart, StatTile } from "@/components/dashboard/charts";
import { DashboardFilters } from "@/components/dashboard/filters";
import { monthName, todayKey } from "@/components/agenda/dates";

export const metadata: Metadata = { title: "Painel" };

function summary(d: DashboardData) {
  const month = monthName(todayKey().slice(0, 7));
  const parts: string[] = [];
  if (d.month.posts) {
    parts.push(
      `${d.month.posts === 1 ? "1 artigo foi ao ar" : `${d.month.posts} artigos foram ao ar`} em ${month}, em ${
        d.month.sites === 1 ? "1 site" : `${d.month.sites} sites`
      }.`,
    );
  } else if (d.postCount) {
    parts.push(`Nenhum artigo foi ao ar em ${month} ainda.`);
  }
  if (d.counts.stale) {
    parts.push(
      d.counts.stale === 1
        ? "1 site está parado há mais de 30 dias ou nunca recebeu artigo."
        : `${d.counts.stale} sites estão parados há mais de 30 dias ou nunca receberam artigo.`,
    );
  } else if (d.siteCount && d.postCount) {
    parts.push("Nenhum site parado.");
  }
  return parts.join(" ") || undefined;
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const sp = await searchParams;
  const period = toPeriod(sp.periodo);
  const rawClient = typeof sp.cliente === "string" ? sp.cliente : "";
  const clientId = rawClient && isUuid(rawClient) ? rawClient : "";
  const [data, analytics, clientOptions] = await Promise.all([
    getDashboard(),
    getAnalytics(period, clientId || undefined),
    listClientOptions(),
  ]);
  const fresh = data.counts.fresh;
  const activeSites = data.counts.fresh + data.counts.attention + data.counts.stale;
  const del = analytics.deliveries;
  const successRate = del.total ? Math.round((del.ok / del.total) * 100) : 0;

  if (!data.clientCount) {
    return (
      <>
        <PageHeader title="Painel" />
        <Onboarding />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Painel" description={summary(data)} />
      {!data.postCount && data.siteCount ? (
        <div className="mb-6">
          <FirstArticle />
        </div>
      ) : null}
      <DashboardFilters
        period={period}
        clientId={clientId}
        clients={clientOptions.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* Indicadores do período */}
      <section aria-label="Indicadores" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Artigos publicados"
          value={analytics.published.value}
          previous={analytics.published.previous}
          previousLabel={analytics.previousLabel}
          trend={analytics.published.trend}
        />
        <StatTile
          label="Leituras nos sites"
          value={analytics.views.value}
          previous={analytics.views.previous}
          previousLabel={analytics.previousLabel}
          trend={analytics.views.trend}
        />
        <StatTile
          label="Sites em dia"
          value={fresh}
          suffix={`/${activeSites}`}
          note={activeSites ? "Com artigo novo nos últimos 14 dias" : "Cadastre sites para acompanhar"}
        />
        <StatTile
          label="Entregas com sucesso"
          value={successRate}
          suffix="%"
          note={del.total ? `${del.ok} de ${del.total} envios aos sites no período` : "Nenhum envio no período"}
        />
      </section>

      {/* Gráficos */}
      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Leituras por dia" description={`Visitas aos artigos nos sites dos clientes, últimos ${period} dias.`}>
          <AreaChart points={analytics.viewsSeries} unit={["leitura", "leituras"]} caption={`Leituras por dia nos últimos ${period} dias`} />
        </Panel>
        <Panel title="Artigos por cliente" description={`Publicados nos últimos ${period} dias.`}>
          <BarList items={analytics.byClient.slice(0, 8)} unit={["artigo", "artigos"]} empty="Nenhum artigo publicado no período." />
        </Panel>
      </div>
      <div className="mb-8">
        <Panel
          title={analytics.publishedBucket === "week" ? "Publicações por semana" : "Publicações por dia"}
          description="Artigos que foram ao ar nos sites (cada site conta uma publicação)."
        >
          <ColumnChart
            points={analytics.publishedSeries}
            unit={["publicação", "publicações"]}
            caption={`Publicações nos últimos ${period} dias`}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_auto_auto_auto_1fr]">
        <AttentionPanel
          failures={data.failures}
          total={data.failureTotal}
          className={data.failures.length ? "self-start xl:col-start-2 xl:row-start-1" : "order-last self-start xl:order-none xl:col-start-2 xl:row-start-1"}
        />
        <div className="min-w-0 xl:col-start-1 xl:row-span-5 xl:row-start-1">
          <SiteNetwork network={data.network} counts={data.counts} />
        </div>
        <UpcomingPanel items={data.upcoming} className="self-start xl:col-start-2 xl:row-start-2" />
        <DraftsPanel items={data.drafts} className="self-start xl:col-start-2 xl:row-start-3" />
        <TopReadPanel items={data.topRead} className="self-start xl:col-start-2 xl:row-start-4" />
      </div>
    </>
  );
}
