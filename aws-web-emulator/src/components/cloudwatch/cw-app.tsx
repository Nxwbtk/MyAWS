"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Badge from "@cloudscape-design/components/badge"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { CloudWatchOverview } from "@/components/cloudwatch/overview"
import { LiveTailPage, LogGroupDetailPage, LogGroupsPage, LogStreamPage, LogsInsightsPage } from "@/components/cloudwatch/logs"

const link = (text: string, href: string, info?: ReactNode): SideNavigationProps.Item => ({ type: "link", text, href, info })

const nav: SideNavigationProps.Item[] = [
  link("Dashboards", "/cloudwatch/dashboards"),
  link("AI Operations", "/cloudwatch/ai-operations", <Badge color="blue">New</Badge>),
  { type: "section", text: "Alarms", items: [link("In alarm", "/cloudwatch/alarms?state=ALARM"), link("All alarms", "/cloudwatch/alarms")] },
  { type: "section", text: "Logs", items: [link("Log Management", "/cloudwatch/log-groups"), link("Logs Anomalies", "/cloudwatch/logs-anomalies"), link("Live Tail", "/cloudwatch/live-tail"), link("Logs Insights", "/cloudwatch/logs-insights"), link("Contributor Insights", "/cloudwatch/contributor-insights")] },
  { type: "section", text: "Metrics", items: [link("All metrics", "/cloudwatch/metrics"), link("Explorer", "/cloudwatch/metrics-explorer"), link("Streams", "/cloudwatch/metric-streams")] },
  { type: "section", text: "Application Signals (APM)", items: [link("Services", "/cloudwatch/application-signals"), link("Synthetics Canaries", "/cloudwatch/synthetics"), link("RUM", "/cloudwatch/rum")] },
  { type: "section", text: "Network Monitoring", items: [link("Internet Monitors", "/cloudwatch/internet-monitor"), link("Flow Monitors", "/cloudwatch/flow-monitors")] },
  { type: "section", text: "Insights", items: [link("Container Insights", "/cloudwatch/container-insights"), link("Lambda Insights", "/cloudwatch/lambda-insights")] },
  link("Settings", "/cloudwatch/settings"),
  link("Getting Started", "/cloudwatch/getting-started"),
]

export function CwLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "dashboard" | "wizard" }) {
  const parts = usePathname().split("/").filter(Boolean)
  const state = useSearchParams().get("state")
  const active = parts[1] === "alarms" && !parts[2] && state === "ALARM" ? "/cloudwatch/alarms?state=ALARM" : parts.length > 1 ? `/cloudwatch/${parts[1]}` : "/cloudwatch"
  return (
    <ConsoleLayout serviceName="CloudWatch" serviceHref="/cloudwatch" nav={nav} activeHref={active} breadcrumbs={[{ text: "CloudWatch", href: "/cloudwatch" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const titles: Record<string, string> = {
  "ai-operations": "AI Operations",
  "logs-anomalies": "Logs Anomalies",
  "contributor-insights": "Contributor Insights",
  "metrics-explorer": "Metrics Explorer",
  "metric-streams": "Metric Streams",
  "application-signals": "Application Signals",
  synthetics: "Synthetics Canaries",
  rum: "RUM",
  "internet-monitor": "Internet Monitors",
  "flow-monitors": "Flow Monitors",
  "container-insights": "Container Insights",
  "lambda-insights": "Lambda Insights",
  settings: "Settings",
  "getting-started": "Getting Started",
}

function Unavailable({ section }: { section: string }) {
  const title = titles[section] ?? "Not found"
  return (
    <CwLayout breadcrumbs={[{ text: title, href: `/cloudwatch/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This CloudWatch feature isn&apos;t provided by the local AWS Emulator.</Alert>
      </ContentLayout>
    </CwLayout>
  )
}

export function CloudWatchApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, a, b] = path
  switch (section) {
    case undefined:
    case "home":
      return <CloudWatchOverview />
    case "log-groups":
      if (a && b) return <LogStreamPage group={decodeURIComponent(a)} stream={decodeURIComponent(b)} />
      if (a) return <LogGroupDetailPage name={decodeURIComponent(a)} tab={params.get("tab") ?? "streams"} />
      return <LogGroupsPage />
    case "logs-insights":
      return <LogsInsightsPage initialGroup={params.get("group") ?? undefined} />
    case "live-tail":
      return <LiveTailPage />
    default:
      return <Unavailable section={section} />
  }
}
