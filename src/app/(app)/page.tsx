import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/panel";
import { SiteNetwork } from "@/components/dashboard/site-network";
import { AttentionPanel, DraftsPanel, TopReadPanel, UpcomingPanel } from "@/components/dashboard/side-panels";
import { FirstArticle, Onboarding } from "@/components/dashboard/onboarding";
import { getDashboard, type DashboardData } from "@/lib/data/dashboard";
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

export default async function DashboardPage() {
  const data = await getDashboard();

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
