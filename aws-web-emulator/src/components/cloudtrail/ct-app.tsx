"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Badge from "@cloudscape-design/components/badge"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { CloudTrailDashboard } from "@/components/cloudtrail/dashboard"
import { EventDetailPage, EventHistoryPage, InsightsPage } from "@/components/cloudtrail/events"
import { CreateTrailPage, TrailDetailPage, TrailsPage } from "@/components/cloudtrail/trails"
import { CreateEventDataStorePage, EventDataStoreDetailPage, EventDataStoresPage, LakeQueryPage } from "@/components/cloudtrail/lake"

const link = (text: string, href: string, info?: ReactNode): SideNavigationProps.Item => ({ type: "link", text, href, info })

const nav: SideNavigationProps.Item[] = [
  link("Dashboard", "/cloudtrail"),
  link("Data event coverage", "/cloudtrail/data-event-coverage", <Badge color="blue">New</Badge>),
  link("Event history", "/cloudtrail/events"),
  link("Insights", "/cloudtrail/insights"),
  link("Trails", "/cloudtrail/trails"),
  { type: "section", text: "Lake", items: [link("Dashboards", "/cloudtrail/lake-dashboards"), link("Query", "/cloudtrail/query"), link("Event data stores", "/cloudtrail/event-data-stores")] },
  link("Settings", "/cloudtrail/settings"),
  { type: "divider" },
  { type: "link", text: "Pricing", href: "https://aws.amazon.com/cloudtrail/pricing/", external: true },
  { type: "link", text: "Documentation", href: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/", external: true },
]

export function CtLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "dashboard" | "wizard" }) {
  const parts = usePathname().split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName="CloudTrail" serviceHref="/cloudtrail" nav={nav} activeHref={parts.length > 1 ? `/cloudtrail/${parts[1]}` : "/cloudtrail"} breadcrumbs={[{ text: "CloudTrail", href: "/cloudtrail" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const titles: Record<string, string> = { "data-event-coverage": "Data event coverage", "lake-dashboards": "Lake dashboards", settings: "Settings" }

function Unavailable({ section }: { section: string }) {
  const title = titles[section] ?? "Not found"
  return (
    <CtLayout breadcrumbs={[{ text: title, href: `/cloudtrail/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This CloudTrail feature needs APIs that the local AWS Emulator doesn&apos;t provide.</Alert>
      </ContentLayout>
    </CtLayout>
  )
}

export function CloudTrailApp({ path }: { path: string[] }) {
  const [section, a, b] = path
  switch (section) {
    case undefined:
    case "dashboard":
      return <CloudTrailDashboard />
    case "events":
      if (a) return <EventDetailPage id={decodeURIComponent(a)} />
      return <EventHistoryPage />
    case "insights":
      return <InsightsPage />
    case "trails":
      if (a === "create") return <CreateTrailPage />
      if (a) return <TrailDetailPage name={decodeURIComponent(a)} />
      return <TrailsPage />
    case "event-data-stores":
      if (a === "create") return <CreateEventDataStorePage />
      if (a) return <EventDataStoreDetailPage arn={decodeURIComponent(a)} />
      return <EventDataStoresPage />
    case "query":
      return <LakeQueryPage store={a ? decodeURIComponent(a) : undefined} queryId={b} />
    default:
      return <Unavailable section={section} />
  }
}
